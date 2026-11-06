/**
 * 命盘追问（流式）—— Route Handler。
 *
 * 走 SSE 把模型生成的字一个个吐给浏览器，用户不用对着转圈等十几秒。
 * 口径与 Server Action 版**完全一致**：同样只检索数据集原文、同样在全文齐了之后
 * 跑机械防编造自检（结论随 done 事件一起给）。
 *
 * 响应格式（一行一个 JSON，`data:` 前缀）：
 *   {type:'thinking',   text}                  思维链增量（等待期进度展示，不进正文）
 *   {type:'delta',      text}                  正文增量
 *   {type:'done',       answer, cited, verification, model}   全文 + 自检结论
 *   {type:'not-covered',message}               样本库未覆盖（原样透出 core 的说明）
 *   {type:'quota-exceeded',code,message,limit,packEntry}  免费额度用尽（内置 AI 每日限额）
 *   {type:'error',      message}               失败
 */

import {
  AskService,
  AskProviderNotConfiguredError,
  AskProviderError,
  type AskTurn,
} from '@ziwei/ask';
import { providerFromUserConfig, readUserProvider } from '@/app/ai-provider';
import { requestIp, reserveFor, type QuotaSubject } from '@/lib/askAccess';
import { currentUser } from '@/lib/session';
import { packEntry } from '@/lib/trafficPacks';

export const dynamic = 'force-dynamic';

/** 单条问题长度上限（字符）——与前端输入框 maxLength 一致 */
const MAX_QUESTION_CHARS = 2000;
/** 带入提示词的对话上文轮数 / 单条截断 */
const MAX_TURNS = 6;
const TURN_QUESTION_CAP = 200;
const TURN_ANSWER_CAP = 500;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

/** 解析前端带上来的对话上文；脏数据一律丢弃，绝不让它撑爆提示词 */
function parseTurns(raw: string): AskTurn[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (t): t is { question: string; answer: string } =>
          !!t &&
          typeof (t as { question?: unknown }).question === 'string' &&
          typeof (t as { answer?: unknown }).answer === 'string',
      )
      .slice(-MAX_TURNS)
      .map((t) => ({
        question: t.question.slice(0, TURN_QUESTION_CAP),
        answer: t.answer.slice(0, TURN_ANSWER_CAP),
      }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const question = str(formData, 'question').trim();
  const year = Number(str(formData, 'year'));
  const month = Number(str(formData, 'month'));
  const day = Number(str(formData, 'day'));
  const hour = Number(str(formData, 'hour'));
  const gender = str(formData, 'gender') === 'female' ? 'female' : 'male';

  if (!question) return sseError('请先写下你的问题。');
  if (question.length > MAX_QUESTION_CHARS) {
    return sseError(`问题太长了，请控制在 ${MAX_QUESTION_CHARS} 字以内。`);
  }
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 11
  ) {
    return sseError('生辰参数不完整，请回到输入页重新排盘。');
  }

  // 用户自配 provider 优先；没配就用服务端环境变量（走每日限额：先占后还，失败退次）
  const userCfg = readUserProvider(formData);
  const userProvider = providerFromUserConfig(userCfg);
  let refund: (() => void) | null = null;
  if (!userProvider) {
    // 有登录态就按账户扣（先免费日额 → 再流量包余额），否则按 IP 扣
    const user = await currentUser();
    const subject: QuotaSubject = user
      ? { kind: 'user', userId: user.id }
      : { kind: 'ip', ip: await requestIp() };
    const r = reserveFor(subject);
    if (!r.ok) return sseQuotaExceeded(r.limit, Boolean(user));
    refund = r.refund;
  }

  const service = new AskService(userProvider ? { provider: userProvider } : {});
  const turns = parseTurns(str(formData, 'turns'));

  // 思考模式开关：'enabled' / 'disabled'，缺省走 provider 默认（DeepSeek 默认开）
  const thinkingRaw = str(formData, 'thinking').trim();
  const thinking =
    thinkingRaw === 'enabled' || thinkingRaw === 'disabled' ? thinkingRaw : undefined;

  // 页内追问焦点：来自哪个解读维度 / 宫位 / 时间层（未知值在 prompt 层会被忽略）
  const timeRaw = str(formData, 'time').trim();
  const focus = {
    ...(str(formData, 'dimension').trim()
      ? { dimension: str(formData, 'dimension').trim() }
      : {}),
    ...(str(formData, 'palace').trim() ? { palace: str(formData, 'palace').trim() } : {}),
    ...(timeRaw === 'liunian' || timeRaw === 'daxian'
      ? {
          time: timeRaw as 'liunian' | 'daxian',
          ...(timeRaw === 'liunian' && Number(str(formData, 'targetYear'))
            ? { targetYear: Number(str(formData, 'targetYear')) }
            : {}),
        }
      : {}),
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          /* 客户端已断开 */
        }
      };
      // 额度：提问前已占好一次；只有走到 done 才算用掉，其余结局（未覆盖 / 报错 / 断流）退还
      let consumed = false;
      try {
        // 思考型模型（MiniMax-M3 等）把思考 token 吃进 max_tokens 预算，预算小了正文整段为空。
        // 第一次空正文时自动加大预算重试一次 —— 不让用户自己去改设置。
        const baseBudget = userCfg?.maxTokens ?? 8000;
        const RETRY_BUDGET = Math.max(32000, baseBudget * 2);
        let finalEmptyError = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          const svc =
            attempt === 0
              ? service
              : new AskService({
                  ...(userProvider ? { provider: userProvider } : {}),
                  maxTokens: RETRY_BUDGET,
                });
          let emptyThisAttempt = false;

          for await (const ev of svc.askStream(
            { year, month, day, hour, gender },
            question,
            turns,
            {
              ...(Object.keys(focus).length > 0 ? { focus } : {}),
              ...(thinking ? { thinking } : {}),
            },
          )) {
            if (ev.type === 'delta') {
              send({ type: 'delta', text: ev.text });
            } else if (ev.type === 'thinking') {
              send({ type: 'thinking', text: ev.text });
            } else if (ev.type === 'done') {
              if (!ev.answer.trim()) {
                // 空正文 = 失败（不是「成功的空回答」）：交给外层决定是否重试
                emptyThisAttempt = true;
                break;
              }
              // 成功才计数（前面预占的这一次就此生效，不再退还）
              consumed = true;
              send({
                type: 'done',
                answer: ev.answer,
                cited: ev.citedDimensions,
                verification: ev.verification,
                model: ev.model,
                // 回答署名：这条用的是「你的 Key」还是「内置免费」——前端按条展示，用户随时知道自己用的是谁
                source: userProvider ? 'user' : 'builtin',
              });
            } else if (ev.type === 'not-covered') {
              send({ type: 'not-covered', message: ev.message });
              return;
            } else {
              // provider 级错误：重试解决不了，直接报
              send({ type: 'error', message: ev.message });
              return;
            }
          }

          if (!emptyThisAttempt) break;
          if (attempt === 0) {
            // 让按钮打点：告诉用户正在自动补救，而不是卡死
            send({
              type: 'thinking',
              text: '（思考占满了输出预算，正在自动加大预算重试一次…）',
            });
          } else {
            finalEmptyError = true;
          }
        }

        if (finalEmptyError) {
          send({
            type: 'error',
            message:
              '模型连续两次没有产出正文（思考占满了输出预算）。可以稍后重试；' +
              '如果反复出现，建议换用不带思考的模型（MiniMax-M2.5 等）。',
          });
        }
      } catch (err) {
        const message =
          err instanceof AskProviderNotConfiguredError || err instanceof AskProviderError
            ? err.message
            : err instanceof Error
              ? err.message
              : '追问失败，请稍后重试。';
        send({ type: 'error', message });
      } finally {
        // 失败不扣次：没走到 done 的一切结局（报错 / 未覆盖 / 提前断流）都退还这一次
        if (refund && !consumed) refund();
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // 反代（nginx）不要缓冲，否则流式会被攒成一次性返回
      'x-accel-buffering': 'no',
    },
  });
}

/** 请求还没进入流之前的硬错误：也用同样的 SSE 格式回，前端只有一条解析路径 */
function sseError(message: string): Response {
  return new Response(`data: ${JSON.stringify({ type: 'error', message })}\n\n`, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  });
}

/**
 * 额度用尽：专用事件（不是普通 error），带 QUOTA_EXCEEDED 码 + 流量包入口，
 * 前端据此弹「额度墙」而不是一句干巴巴的报错。
 *
 * loggedIn 告诉前端「买包前要不要先登录」—— 未登录时购买入口应引导登录。
 */
function sseQuotaExceeded(limit: number, loggedIn: boolean): Response {
  return new Response(
    `data: ${JSON.stringify({
      type: 'quota-exceeded',
      code: 'QUOTA_EXCEEDED',
      message: `每日免费体验限 ${limit} 次，已到上限。`,
      limit,
      loggedIn,
      packEntry: packEntry(),
    })}\n\n`,
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      },
    },
  );
}
