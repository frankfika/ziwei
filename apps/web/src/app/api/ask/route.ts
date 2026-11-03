/**
 * 命盘追问（流式）—— Route Handler。
 *
 * 走 SSE 把模型生成的字一个个吐给浏览器，用户不用对着转圈等十几秒。
 * 口径与 Server Action 版**完全一致**：同样只检索数据集原文、同样在全文齐了之后
 * 跑机械防编造自检（结论随 done 事件一起给）。
 *
 * 响应格式（一行一个 JSON，`data:` 前缀）：
 *   {type:'delta',      text}                  正文增量
 *   {type:'done',       answer, cited, verification, model}   全文 + 自检结论
 *   {type:'not-covered',message}               样本库未覆盖（原样透出 core 的说明）
 *   {type:'error',      message}               失败
 */

import {
  AskService,
  AskProviderNotConfiguredError,
  AskProviderError,
  type AskTurn,
} from '@ziwei/ask';
import { providerFromUserConfig, readUserProvider } from '@/app/ai-provider';
import { consumeAskQuota, checkAskQuota } from '@/lib/askQuota';

export const dynamic = 'force-dynamic';

/** 单条问题长度上限（字符） */
const MAX_QUESTION_CHARS = 500;
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

  // 用户自配 provider 优先；没配就用服务端环境变量（走每日限额：先查后发，成功才计数）
  const userProvider = providerFromUserConfig(readUserProvider(formData));
  if (!userProvider) {
    const q = await checkAskQuota();
    if (!q.ok) return sseError(q.message);
  }

  const service = new AskService(userProvider ? { provider: userProvider } : {});
  const turns = parseTurns(str(formData, 'turns'));

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
      try {
        for await (const ev of service.askStream(
          { year, month, day, hour, gender },
          question,
          turns,
          Object.keys(focus).length > 0 ? { focus } : undefined,
        )) {
          if (ev.type === 'delta') {
            send({ type: 'delta', text: ev.text });
          } else if (ev.type === 'done') {
            // 成功才计数（失败不消耗额度）
            if (!userProvider) await consumeAskQuota();
            send({
              type: 'done',
              answer: ev.answer,
              cited: ev.citedDimensions,
              verification: ev.verification,
              model: ev.model,
            });
          } else if (ev.type === 'not-covered') {
            send({ type: 'not-covered', message: ev.message });
          } else {
            send({ type: 'error', message: ev.message });
          }
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
