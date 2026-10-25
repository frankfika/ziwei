/**
 * Anthropic Messages API provider。
 *
 * **构造时不联网**；只有 `complete()` 被调用时才发请求。
 */

import { AskProviderError, type AskProvider, type AskRequest, type AskResponse } from '../types';

export interface AnthropicProviderOptions {
  /** API key。 */
  apiKey: string;
  /** 模型名，如 claude-sonnet-4-20250514。 */
  model: string;
  /** API 根地址，默认 https://api.anthropic.com 。 */
  baseUrl?: string;
  /** 直接指定完整 endpoint（优先级最高）。 */
  endpoint?: string;
  /** anthropic-version 头，默认 2023-06-01 。 */
  anthropicVersion?: string;
  /** 单次请求超时（毫秒），默认 60s。 */
  timeoutMs?: number;
  /** 默认 max_tokens（Anthropic 必填）。 */
  defaultMaxTokens?: number;
  /** 默认 temperature。 */
  defaultTemperature?: number;
  /** 附加请求头。 */
  headers?: Record<string, string>;
  /** 注入 fetch 实现（测试用）。 */
  fetchImpl?: typeof fetch;
}

const PROVIDER_NAME = 'anthropic';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 2048;

function readText(data: any): string {
  const content = data?.content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c?.type === 'text' || typeof c?.text === 'string')
      .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
      .join('');
  }
  if (typeof content === 'string') return content;
  return '';
}

/** 创建一个 Anthropic provider。 */
export function createAnthropicProvider(opts: AnthropicProviderOptions): AskProvider {
  const {
    apiKey,
    model,
    baseUrl = DEFAULT_BASE_URL,
    endpoint,
    anthropicVersion = DEFAULT_VERSION,
    timeoutMs = 60_000,
    defaultMaxTokens = DEFAULT_MAX_TOKENS,
    defaultTemperature,
    headers = {},
    fetchImpl,
  } = opts;

  if (!model) {
    throw new Error('createAnthropicProvider: 必须提供 model');
  }

  const url = endpoint ?? `${baseUrl.replace(/\/+$/, '')}/v1/messages`;

  return {
    name: PROVIDER_NAME,

    async complete(req: AskRequest): Promise<AskResponse> {
      const doFetch = fetchImpl ?? fetch;
      const body: Record<string, unknown> = {
        model,
        max_tokens: req.maxTokens ?? defaultMaxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      };
      const temperature = req.temperature ?? defaultTemperature;
      if (temperature !== undefined) body.temperature = temperature;

      const requestHeaders: Record<string, string> = {
        'content-type': 'application/json',
        'anthropic-version': anthropicVersion,
        ...headers,
      };
      if (apiKey) requestHeaders['x-api-key'] = apiKey;

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

      return {
        text: readText(data),
        provider: PROVIDER_NAME,
        model: data?.model ?? model,
        usage: {
          promptTokens: data?.usage?.input_tokens,
          completionTokens: data?.usage?.output_tokens,
        },
        raw: data,
      };
    },
  };
}
