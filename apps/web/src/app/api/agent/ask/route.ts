/**
 * 眼镜端追问接口 —— POST /api/agent/ask
 *
 * 服务对象是 Rokid AI 眼镜上的 AIUI 智能体：眼镜端发 JSON body 过来，
 * 期望拿回一条完整回答（客户端见 apps/rokid-agent/lib/api.js 的 requestAsk）。
 *
 * 边界：
 *  · 排盘与解读原文**只走** @ziwei/core（ZiweiService），模型只负责「把原文讲成一段话」，
 *    不允许模型自己算盘或凭空断语 —— 这是 AskService 内部已经定死的口径，本路由只调用它；
 *  · 样本库未覆盖的生辰**如实说没覆盖**，此时不出模型、不扣额度；
 *  · 配额沿用站内口径（见 apps/web/src/app/api/ask/route.ts）：
 *    先占后还 —— 提问前占一次，只有真的给出回答才计数，其余结局（未覆盖 / provider 报错）退还；
 *  · 眼镜端没有登录态、没有自备 Key 的通道，所以按 IP 计额（VIP 白名单仍然生效）；
 *  · CORS / 生辰解析共享实现见 @/lib/agentHttp，三个 agent 接口只有这一份。
 *
 * 响应：
 *   正常   { answer, cited, verification, model }
 *   未覆盖 { status:'not-covered', answer:<core 的诚实说明>, cited, verification, model, key, reason, availableYears }
 *     —— answer 里放说明而不是空串，是因为眼镜端会把 answer 直接念出来，
 *        空串等于什么都不说；换成 core 的原话，用户至少知道该换哪一年。
 */

import {
  AskProviderError,
  AskProviderNotConfiguredError,
  AskService,
  type AskFocus,
  type AskTurn,
  type VerifyAnswerResult,
} from '@ziwei/ask';
import { redactCitations } from '@ziwei/citation-guard';

import { agentJson, agentOptions, parseBirth, toInt } from '@/lib/agentHttp';
import { requestIp, reserveFor, type QuotaSubject } from '@/lib/askAccess';
import { AGENT_SYSTEM_EXTRA, redactingService } from '@/lib/agentCitation';
import { AGENT_CITATION_MODE_LABEL, resolveAgentCitationMode } from '@/lib/citations';
import { getService } from '@/lib/service';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** 预检：眼镜端走 fetch 时会先发 OPTIONS，这里必须先放行 */
export function OPTIONS(): Response {
  return agentOptions();
}

/** 单条问题长度上限（字符）——与站内追问一致 */
const MAX_QUESTION_CHARS = 2000;
/** 带入提示词的对话上文轮数 / 单条截断 —— 与站内追问一致，防止脏数据撑爆提示词 */
const MAX_TURNS = 6;
const TURN_QUESTION_CAP = 200;
const TURN_ANSWER_CAP = 500;

/** 解析对话上文；脏数据一律丢弃，绝不让它撑爆提示词 */
function parseTurns(raw: unknown): AskTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is { question: string; answer: string } => {
      if (!t || typeof t !== 'object') return false;
      const o = t as Record<string, unknown>;
      return typeof o.question === 'string' && typeof o.answer === 'string';
    })
    .slice(-MAX_TURNS)
    .map((t) => ({
      question: t.question.slice(0, TURN_QUESTION_CAP),
      answer: t.answer.slice(0, TURN_ANSWER_CAP),
    }));
}

/**
 * 解析页内焦点（维度 / 宫位 / 时间层）。
 * 只认白名单里的取值 —— 焦点会进提示词，不能让设备端随意注入内容。
 */
function parseFocus(raw: unknown): AskFocus | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const focus: AskFocus = {};

  const dimension = typeof o.dimension === 'string' ? o.dimension.trim() : '';
  if (dimension) focus.dimension = dimension;

  const palace = typeof o.palace === 'string' ? o.palace.trim() : '';
  if (palace) focus.palace = palace;

  const time = o.time === 'liunian' || o.time === 'daxian' ? o.time : null;
  if (time) {
    focus.time = time;
    // targetYear 只在流年焦点下有意义（大限焦点由引擎按当下算）
    const targetYear = toInt(o.targetYear);
    if (time === 'liunian' && targetYear !== null) focus.targetYear = targetYear;
  }

  return Object.keys(focus).length > 0 ? focus : undefined;
}

/**
 * 机械防编造自检结论 —— 眼镜端要的是一句话（它会把 answer 直接念出来），
 * 所以把结构化结论压成一句中文；有问题时用 verify 生成的原文提示。
 */
function verificationText(v: VerifyAnswerResult): string {
  if (v.ok) return '自检通过：回答未引入盘面之外的事实。';
  return v.warnings.join(' ') || '这条回答里有些说法超出了你的盘面材料，请谨慎参考。';
}


export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return agentJson({ error: '请求体不是合法的 JSON。' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return agentJson({ error: '请求体必须是一个 JSON 对象。' }, 400);
  }
  const body = payload as Record<string, unknown>;

  const parsed = parseBirth(body);
  if (!parsed.ok) {
    return agentJson({ error: parsed.message }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return agentJson({ error: '请先写下你的问题。' }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return agentJson({ error: `问题太长了，请控制在 ${MAX_QUESTION_CHARS} 字以内。` }, 400);
  }

  // 额度：先占后还 —— 占成功才开始调模型，没占到直接出墙
  const user = await currentUser();
  const subject: QuotaSubject = user
    ? { kind: 'user', userId: user.id }
    : { kind: 'ip', ip: await requestIp() };
  const reservation = reserveFor(subject);
  if (!reservation.ok) {
    return agentJson(
      {
        error: `每日免费体验限 ${reservation.limit} 次，已到上限。`,
        code: 'QUOTA_EXCEEDED',
        limit: reservation.limit,
      },
      429,
    );
  }

  // 复用站内单例（getService），年份索引缓存不用每个请求重新解析
  // 引文降级在**输入层**就做（见 redactingService）：模型看不到受限原文
  const mode = resolveAgentCitationMode(process.env.ZIWEI_CITATION_MODE);
  const service = new AskService({
    service: redactingService(getService(), mode),
    extraSystem: AGENT_SYSTEM_EXTRA,
  });
  const turns = parseTurns(body.turns);
  const focus = parseFocus(body.focus);

  // 只有真的给出回答才计数；未覆盖 / provider 报错 / 其他异常一律退还这一次
  let consumed = false;
  try {
    const result = await service.ask(parsed.birth, question, turns, focus ? { focus } : undefined);

    if (result.status === 'not-covered') {
      return agentJson(
        {
          status: 'not-covered',
          // answer 里放 core 的诚实说明：眼镜端会把 answer 念出来，空话等于没说
          answer: result.message,
          cited: [],
          verification: '样本库未覆盖该生辰，未生成回答。',
          model: '',
          key: result.key,
          reason: result.reason,
          availableYears: result.availableYears,
        },
        200,
      );
    }

    consumed = true;
    return agentJson(
      {
        /**
         * 输出层兜底降级。
         *
         * 输入层已经把原文降级过了，模型理论上没机会复述；
         * 但模型可能有《天纪》的**先验记忆**，也可能自己写出带标记的引文片段。
         * 这一层挡的是这种「模型自带」的漏法 —— 便宜，且不改变正常回答。
         */
        answer: mode === 'full' ? result.answer : redactCitations(result.answer, mode),
        cited: result.citedDimensions,
        verification: verificationText(result.verification),
        model: result.model ?? result.provider,
        // 模式要让眼镜端能披露（见 reading 路由的同名字段）
        citationMode: mode,
        citationModeLabel: AGENT_CITATION_MODE_LABEL[mode],
      },
      200,
    );
  } catch (err) {
    if (err instanceof AskProviderNotConfiguredError) {
      return agentJson({ error: err.message }, 503);
    }
    if (err instanceof AskProviderError) {
      return agentJson({ error: err.message }, 502);
    }
    return agentJson(
      { error: err instanceof Error ? err.message : '追问失败，请稍后重试。' },
      500,
    );
  } finally {
    if (!consumed) reservation.refund();
  }
}
