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
 *  · 眼镜端没有登录态、没有自备 Key 的通道，所以按 IP 计额（VIP 白名单仍然生效）。
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
import { InvalidBirthError, validateBirth } from '@ziwei/chart-engine';
import { redactCitations } from '@ziwei/citation-guard';
import type { Birth } from '@ziwei/core';

import { requestIp, reserveFor, type QuotaSubject } from '@/lib/askAccess';
import { AGENT_SYSTEM_EXTRA, redactingService } from '@/lib/agentCitation';
import { AGENT_CITATION_MODE_LABEL, resolveAgentCitationMode } from '@/lib/citations';
import { getService } from '@/lib/service';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * CORS 头 —— 眼镜端的来源不可控（小程序 wx.request / fetch 行为还不一致），
 * 只能放开。三个接口都只读不写，不带凭证，所以 `*` 是安全的。
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 预检：眼镜端走 fetch 时会先发 OPTIONS，这里必须先放行 */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 统一 JSON 出口 —— CORS 头与禁缓存策略只在这里写一次，避免漏在某个分支上 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      // 问答内容是个人隐私数据，不许任何一层缓存
      'cache-control': 'no-store',
    },
  });
}

/** 单条问题长度上限（字符）——与站内追问一致 */
const MAX_QUESTION_CHARS = 2000;
/** 带入提示词的对话上文轮数 / 单条截断 —— 与站内追问一致，防止脏数据撑爆提示词 */
const MAX_TURNS = 6;
const TURN_QUESTION_CAP = 200;
const TURN_ANSWER_CAP = 500;

/** 生辰解析结果 */
type ParseResult =
  | { ok: true; birth: Birth }
  | { ok: false; message: string };

/**
 * 取整数：设备端理论上发的是 number，但语音识别链路可能把数字转成字符串，
 * 这里一并接受，避免因为类型差异把合法生辰判死。
 */
function toInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * 解析并校验生辰。
 *
 * 范围判定直接借用引擎自己的 validateBirth（@ziwei/chart-engine 导出的权威实现），
 * 不在这里另写一套 —— 引擎认的口径就是数据集认的口径，两边必须一模一样。
 */
function parseBirth(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '请求体必须是一个 JSON 对象。' };
  }
  const o = raw as Record<string, unknown>;

  const missing = (['year', 'month', 'day', 'hour', 'gender'] as const).filter(
    (k) => o[k] === undefined || o[k] === null,
  );
  if (missing.length > 0) {
    return { ok: false, message: '请提供完整的出生参数：year、month、day、hour、gender。' };
  }

  const year = toInt(o.year);
  const month = toInt(o.month);
  const day = toInt(o.day);
  const hour = toInt(o.hour);
  if (year === null || month === null || day === null || hour === null) {
    return { ok: false, message: '出生参数格式不对：year、month、day、hour 需要是整数。' };
  }
  if (o.gender !== 'male' && o.gender !== 'female') {
    return { ok: false, message: '性别需为 male 或 female。' };
  }

  const birth: Birth = { year, month, day, hour, gender: o.gender };
  try {
    validateBirth(birth);
  } catch (err) {
    if (err instanceof InvalidBirthError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
  return { ok: true, birth };
}

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
    return json({ error: '请求体不是合法的 JSON。' }, 400);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ error: '请求体必须是一个 JSON 对象。' }, 400);
  }
  const body = payload as Record<string, unknown>;

  const parsed = parseBirth(body);
  if (!parsed.ok) {
    return json({ error: parsed.message }, 400);
  }

  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return json({ error: '请先写下你的问题。' }, 400);
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: `问题太长了，请控制在 ${MAX_QUESTION_CHARS} 字以内。` }, 400);
  }

  // 额度：先占后还 —— 占成功才开始调模型，没占到直接出墙
  const user = await currentUser();
  const subject: QuotaSubject = user
    ? { kind: 'user', userId: user.id }
    : { kind: 'ip', ip: await requestIp() };
  const reservation = reserveFor(subject);
  if (!reservation.ok) {
    return json(
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
      return json(
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
    return json(
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
      return json({ error: err.message }, 503);
    }
    if (err instanceof AskProviderError) {
      return json({ error: err.message }, 502);
    }
    return json(
      { error: err instanceof Error ? err.message : '追问失败，请稍后重试。' },
      500,
    );
  } finally {
    if (!consumed) reservation.refund();
  }
}
