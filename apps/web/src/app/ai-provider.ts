/**
 * 用户自配 AI provider —— 服务端按前端传来的配置临时构造 provider。
 * （工具模块，只被追问路由 /api/ask 引用，不是 Server Action 文件。）
 *
 * 配置只在本机浏览器里（localStorage），每次请求随表单带上来；
 * 服务端**不落盘、不写日志**，用完即弃。
 * 没传配置就回落到服务端环境变量（ZIWEI_ASK_*）。
 */

import {
  AskService,
  AskProviderNotConfiguredError,
  AskProviderError,
  createAnthropicProvider,
  createOpenAICompatibleProvider,
  createEchoProvider,
  type AskProvider,
  type AskTurn,
} from '@ziwei/ask';

/** 前端传来的用户配置（已在前端做过基本校验） */
export interface UserProviderInput {
  kind?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/** 从表单里读用户配置；字段缺失或不合理就返回 null（回落到环境变量） */
export function readUserProvider(formData: FormData): UserProviderInput | null {
  const kind = str(formData, 'ai_kind').trim();
  const apiKey = str(formData, 'ai_key').trim();
  const model = str(formData, 'ai_model').trim();
  if (!kind || !apiKey || !model) return null;
  if (kind !== 'openai' && kind !== 'anthropic' && kind !== 'echo') return null;

  const baseUrl = str(formData, 'ai_base_url').trim();
  if (kind === 'openai' && !baseUrl) return null;

  const maxTokensRaw = Number(str(formData, 'ai_max_tokens'));
  const maxTokens =
    Number.isFinite(maxTokensRaw) && maxTokensRaw >= 256 && maxTokensRaw <= 64000
      ? Math.floor(maxTokensRaw)
      : undefined;

  return {
    kind,
    baseUrl,
    apiKey,
    model,
    ...(maxTokens ? { maxTokens } : {}),
  };
}

/** 按用户配置构造 provider；配置不合法返回 undefined（回落到环境变量） */
export function providerFromUserConfig(input: UserProviderInput | null): AskProvider | undefined {
  if (!input) return undefined;
  try {
    switch (input.kind) {
      case 'openai':
        return createOpenAICompatibleProvider({
          baseUrl: input.baseUrl!,
          apiKey: input.apiKey,
          model: input.model!,
          ...(input.maxTokens ? { defaultMaxTokens: input.maxTokens } : {}),
        });
      case 'anthropic':
        return createAnthropicProvider({
          apiKey: input.apiKey!,
          model: input.model!,
          ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
          ...(input.maxTokens ? { defaultMaxTokens: input.maxTokens } : {}),
        });
      case 'echo':
        return createEchoProvider();
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}
