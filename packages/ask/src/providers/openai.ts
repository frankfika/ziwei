/**
 * OpenAI 兼容协议 provider。
 *
 * 兼容 `/v1/chat/completions`，因此下面这些端点都能直接用：
 *   OpenAI / DeepSeek / 智谱 / 月之暗面 / Groq / Together /
 *   vLLM / Ollama / LM Studio / OpenRouter …
 *
 * **构造时不联网**；只有 `complete()` 被调用时才发请求。
 */

import {
  AskProviderError,
  type AskRequest,
  type AskResponse,
  type AskStreamEvent,
  type AskStreamingProvider,
  type AskUsage,
} from '../types';
import { splitReasoning, ReasoningStripper } from '../reasoning';

export interface OpenAICompatibleProviderOptions {
  /**
   * API 根地址。
   *   · 不带版本段（https://api.openai.com）→ 自动拼 `/v1/chat/completions`
   *   · 带版本段（https://openrouter.ai/api/v1、https://open.bigmodel.cn/api/paas/v4）
   *     → 直接拼 `/chat/completions`
   */
  baseUrl: string;
  /** API key。本地端点（Ollama / vLLM）可省略。 */
  apiKey?: string;
  /** 模型名。 */
  model: string;
  /** 直接指定完整 endpoint（优先级最高）。 */
  endpoint?: string;
  /** 单次请求超时（毫秒），默认 60s。 */
  timeoutMs?: number;
  /** 默认 max_tokens。 */
  defaultMaxTokens?: number;
  /** 默认 temperature。 */
  defaultTemperature?: number;
  /** 附加请求头。 */
  headers?: Record<string, string>;
  /** 注入 fetch 实现（测试用）。 */
  fetchImpl?: typeof fetch;
  /**
   * 是否从正文里剥离思维链（`<think>…</think>`）。
   *
   * 默认 **true**。不少模型（MiniMax-M3 / DeepSeek-R1 / QwQ）会把思维链塞进
   * `content`，原样透出会污染用户看到的答案，也会让防编造机械检查误报
   * （思维链里常出现盘面外的星名）。剥离后原文仍保留在 `raw.reasoning`。
   */
  stripReasoning?: boolean;
}

const PROVIDER_NAME = 'openai-compatible';

/** 把 baseUrl 解析成完整 endpoint。 */
export function resolveChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  // 已带版本段（/v1、/v4、/v1beta …）→ 只补路径
  if (/\/v\d+[a-z0-9]*$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function readContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  // 少数端点返回 content 数组
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'string' ? c : (c?.text ?? '')))
      .join('');
  }
  return '';
}

/** 创建一个 OpenAI 兼容 provider。 */
export function createOpenAICompatibleProvider(
  opts: OpenAICompatibleProviderOptions,
): AskStreamingProvider {
  const {
    baseUrl,
    apiKey,
    model,
    endpoint,
    timeoutMs = 180_000,
    defaultMaxTokens,
    defaultTemperature,
    headers = {},
    fetchImpl,
    stripReasoning: shouldStripReasoning = true,
  } = opts;

  if (!baseUrl && !endpoint) {
    throw new Error('createOpenAICompatibleProvider: 必须提供 baseUrl 或 endpoint');
  }
  if (!model) {
    throw new Error('createOpenAICompatibleProvider: 必须提供 model');
  }

  const url = endpoint ?? resolveChatCompletionsEndpoint(baseUrl);

  const buildBody = (req: AskRequest, stream: boolean): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    };
    const maxTokens = req.maxTokens ?? defaultMaxTokens;
    if (maxTokens !== undefined) body.max_tokens = maxTokens;
    const temperature = req.temperature ?? defaultTemperature;
    if (temperature !== undefined) body.temperature = temperature;
    // DeepSeek 的思考开关（默认开）：显式传才生效。别的 provider 不认这字段，
    // 只在 deepseek 端点上发，避免严格校验的端点（OpenAI 等）对未知参数报错。
    if (req.thinking && /deepseek/i.test(endpoint ?? baseUrl)) {
      body.thinking = { type: req.thinking };
    }
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
      // MiniMax 的思维链拆分开关：开了之后思考过程走独立的 reasoning_content 增量，
      // 等待期能实时展示「模型在想什么」。别的 provider 不认这个字段，只在 MiniMax 端点上发。
      if (/minimax/i.test(baseUrl)) body.reasoning_split = true;
    }
    return body;
  };

  const buildHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { 'content-type': 'application/json', ...headers };
    if (apiKey) h.authorization = `Bearer ${apiKey}`;
    return h;
  };

  const provider: AskStreamingProvider = {
    name: PROVIDER_NAME,

    async complete(req: AskRequest): Promise<AskResponse> {
      const doFetch = fetchImpl ?? fetch;
      const body = buildBody(req, false);
      const requestHeaders = buildHeaders();

      const timeoutSignal = req.signal ?? AbortSignal.timeout(timeoutMs);

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(body),
          signal: timeoutSignal,
        });
      } catch (err) {
        throw new AskProviderError(
          `请求 ${url} 失败：${(err as Error)?.message ?? String(err)}`,
          { provider: PROVIDER_NAME, cause: err },
        );
      }

      const rawText = await res.text();
      if (!res.ok) {
        throw new AskProviderError(
          `provider ${PROVIDER_NAME} 返回 HTTP ${res.status}：${rawText.slice(0, 500)}`,
          { provider: PROVIDER_NAME, status: res.status },
        );
      }

      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch (err) {
        throw new AskProviderError(
          `provider ${PROVIDER_NAME} 返回的不是合法 JSON：${rawText.slice(0, 200)}`,
          { provider: PROVIDER_NAME, cause: err },
        );
      }

      const rawText2 = readContent(data);
      const split = shouldStripReasoning
        ? splitReasoning(rawText2)
        : { text: rawText2, reasoning: '' };

      return {
        text: split.text,
        provider: PROVIDER_NAME,
        model: data?.model ?? model,
        usage: {
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
          totalTokens: data?.usage?.total_tokens,
        },
        raw: { ...data, reasoning: split.reasoning || undefined },
      };
    },

    /**
     * 流式补全：逐块吐正文增量。
     *
     * 思维链的处理是这里的关键：带思维链的模型把思考写进 `content`，
     * 不剥掉就会一边思考一边把「我需要检查命宫有没有贪狼」显示给用户。
     */
    async *stream(req: AskRequest): AsyncGenerator<AskStreamEvent> {
      const doFetch = fetchImpl ?? fetch;
      const body = buildBody(req, true);
      const requestHeaders = buildHeaders();

      // 超时语义是「空闲超时」而不是「总时长上限」：带思维链的长回答总时长
      // 轻松超过一分钟，但只要模型还在吐字就不该掐。定时器在每次读到新数据
      // 时重置；连续 timeoutMs 毫秒没有任何字节才中断。
      const controller = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      const armIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(new Error('idle')), timeoutMs);
      };
      const onOuterAbort = () => controller.abort();
      if (req.signal) {
        if (req.signal.aborted) controller.abort();
        else req.signal.addEventListener('abort', onOuterAbort, { once: true });
      }
      armIdle();

      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (idleTimer) clearTimeout(idleTimer);
        req.signal?.removeEventListener('abort', onOuterAbort);
        const idle = controller.signal.aborted && !req.signal?.aborted;
        yield {
          type: 'error',
          message: idle
            ? `等待模型响应超过 ${Math.round(timeoutMs / 1000)} 秒没有输出，已断开。可以重试。`
            : `请求 ${url} 失败：${(err as Error)?.message ?? String(err)}`,
        };
        return;
      }

      if (!res.ok) {
        if (idleTimer) clearTimeout(idleTimer);
        req.signal?.removeEventListener('abort', onOuterAbort);
        const raw = await res.text().catch(() => '');
        yield {
          type: 'error',
          message: `provider ${PROVIDER_NAME} 返回 HTTP ${res.status}：${raw.slice(0, 500)}`,
        };
        return;
      }
      if (!res.body) {
        if (idleTimer) clearTimeout(idleTimer);
        req.signal?.removeEventListener('abort', onOuterAbort);
        yield { type: 'error', message: 'provider 没有返回可读的流' };
        return;
      }

      const stripper = new ReasoningStripper();
      let full = '';
      let usage: AskUsage | undefined;
      let modelName: string | undefined;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          armIdle(); // 有新数据 —— 空闲计时重置
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let json: any;
            try {
              json = JSON.parse(payload);
            } catch {
              continue;
            }
            if (json.usage) {
              usage = {
                promptTokens: json.usage.prompt_tokens,
                completionTokens: json.usage.completion_tokens,
                totalTokens: json.usage.total_tokens,
              };
            }
            if (json.model) modelName = json.model;
            const delta = json.choices?.[0]?.delta;
            // 思维链（reasoning_content）作为独立的 thinking 事件透传 —— 只展示进度，不进正文
            const thinking = typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '';
            if (thinking) yield { type: 'thinking', text: thinking };
            // <think> 混在 content 里的靠 stripper 剥
            const content = typeof delta?.content === 'string' ? delta.content : '';
            if (!content) continue;
            const visible = shouldStripReasoning ? stripper.push(content) : content;
            if (!visible) continue;
            full += visible;
            yield { type: 'delta', text: visible };
          }
        }
      } catch (err) {
        // 空闲超时是自己 abort 的，别把它说成网络故障
        const idle = controller.signal.aborted && !req.signal?.aborted;
        yield {
          type: 'error',
          message: idle
            ? `模型超过 ${Math.round(timeoutMs / 1000)} 秒没有输出新内容，已断开。可以重试。`
            : `流式读取中断：${(err as Error)?.message ?? String(err)}`,
        };
        return;
      } finally {
        if (idleTimer) clearTimeout(idleTimer);
        req.signal?.removeEventListener('abort', onOuterAbort);
      }

      const tail = shouldStripReasoning ? stripper.flush() : '';
      if (tail) {
        full += tail;
        yield { type: 'delta', text: tail };
      }

      yield { type: 'done', text: full, model: modelName ?? model, usage };
    },
  };

  return provider;
}
