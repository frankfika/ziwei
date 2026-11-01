/**
 * OpenAI 兼容协议 provider。
 *
 * 兼容 `/v1/chat/completions`，因此下面这些端点都能直接用：
 *   OpenAI / DeepSeek / 智谱 / 月之暗面 / Groq / Together /
 *   vLLM / Ollama / LM Studio / OpenRouter …
 *
 * **构造时不联网**；只有 `complete()` 被调用时才发请求。
 */

import { AskProviderError, type AskProvider, type AskRequest, type AskResponse } from '../types';
import { splitReasoning } from '../reasoning';

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
): AskProvider {
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

  return {
    name: PROVIDER_NAME,

    async complete(req: AskRequest): Promise<AskResponse> {
      const doFetch = fetchImpl ?? fetch;
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

      const requestHeaders: Record<string, string> = {
        'content-type': 'application/json',
        ...headers,
      };
      if (apiKey) requestHeaders.authorization = `Bearer ${apiKey}`;

      const timeoutSignal =
        req.signal ?? AbortSignal.timeout(timeoutMs);

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
  };
}
