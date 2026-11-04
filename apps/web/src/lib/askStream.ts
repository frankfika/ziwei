'use client';

/**
 * 追问流式客户端 —— 读 `/api/ask` 的 SSE，把正文增量实时交给界面。
 *
 * 之所以自己读而不是用 Server Action：Server Action 只能一次等到全文，
 * 模型那十几秒里界面只能转圈；SSE 能边生成边显示。
 */

import type { TrafficPack } from './trafficPacks';

export interface AskStreamVerification {
  ok: boolean;
  suspectStars: string[];
  suspectPalaces: string[];
  suspectPlacements: string[];
  warnings: string[];
}

export interface AskStreamDone {
  answer: string;
  cited: string[];
  verification: AskStreamVerification;
  model?: string;
  /** 这条回答用的是谁的配置：user = 用户的 Key，builtin = 站内内置免费额度 */
  source?: 'user' | 'builtin';
}

export interface AskStreamHandlers {
  /** 正文增量 */
  onDelta(text: string): void;
  /** 思维链增量（等待期进度展示用；不思考的老 provider 不会触发） */
  onThinking?(text: string): void;
  /** 全文与自检结论 */
  onDone(payload: AskStreamDone): void;
  /** 失败（未覆盖 / provider 报错 / 网络中断） */
  onError(message: string): void;
  /** 样本库未覆盖 —— message 原样透出，不要自己编 */
  onNotCovered?(message: string): void;
  /** 额度用尽 —— 带流量包入口，前端据此显示额度墙 */
  onQuotaExceeded?(payload: AskStreamQuotaExceeded): void;
}

/** 额度用尽：QUOTA_EXCEEDED + 流量包入口 */
export interface AskStreamQuotaExceeded {
  code: 'QUOTA_EXCEEDED';
  message: string;
  /** 每日上限 */
  limit: number;
  /** 是否已登录 —— 未登录时购买入口要先引导登录 */
  loggedIn: boolean;
  /** 流量包入口（套餐 + checkout stub 路径） */
  packEntry: { packs: TrafficPack[]; checkout: string };
}

interface RawEvent {
  type: 'delta' | 'thinking' | 'done' | 'error' | 'not-covered' | 'quota-exceeded';
  text?: string;
  answer?: string;
  cited?: string[];
  verification?: AskStreamVerification;
  model?: string;
  source?: 'user' | 'builtin';
  message?: string;
  code?: string;
  limit?: number;
  loggedIn?: boolean;
  packEntry?: { packs: TrafficPack[]; checkout: string };
}

/**
 * 发一次追问并消费流。
 *
 * 抛异常只发生在「连不上服务端」这类硬故障；模型侧的失败由 onError 回调给出。
 */
export async function streamAsk(formData: FormData, handlers: AskStreamHandlers): Promise<void> {
  const res = await fetch('/api/ask', { method: 'POST', body: formData });

  if (!res.ok) {
    handlers.onError(`追问请求失败（HTTP ${res.status}），请稍后重试。`);
    return;
  }
  if (!res.body) {
    handlers.onError('当前浏览器不支持流式显示，请升级浏览器后重试。');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let evt: RawEvent;
          try {
            evt = JSON.parse(payload) as RawEvent;
          } catch {
            continue;
          }
          dispatch(evt, handlers);
        }
      }
    }
  } catch (err) {
    handlers.onError(
      `追问连接中断：${err instanceof Error ? err.message : '网络异常'}。可以点重试。`,
    );
  }
}

function dispatch(evt: RawEvent, handlers: AskStreamHandlers): void {
  switch (evt.type) {
    case 'delta':
      if (evt.text) handlers.onDelta(evt.text);
      return;
    case 'thinking':
      if (evt.text) handlers.onThinking?.(evt.text);
      return;
    case 'done':
      handlers.onDone({
        answer: evt.answer ?? '',
        cited: evt.cited ?? [],
        verification: evt.verification ?? {
          ok: true,
          suspectStars: [],
          suspectPalaces: [],
          suspectPlacements: [],
          warnings: [],
        },
        ...(evt.model ? { model: evt.model } : {}),
        ...(evt.source ? { source: evt.source } : {}),
      });
      return;
    case 'not-covered':
      handlers.onNotCovered?.(evt.message ?? '样本库未覆盖该生辰。');
      return;
    case 'quota-exceeded':
      handlers.onQuotaExceeded?.({
        code: 'QUOTA_EXCEEDED',
        message: evt.message ?? '',
        limit: evt.limit ?? 0,
        loggedIn: evt.loggedIn ?? false,
        packEntry: evt.packEntry ?? { packs: [], checkout: '/api/checkout' },
      });
      return;
    default:
      handlers.onError(evt.message ?? '追问失败，请稍后重试。');
  }
}
