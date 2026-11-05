/**
 * 从环境变量解析 provider。
 *
 * 约定（全部可选，但**没有配置就返回 undefined**，不静默失败、不偷用默认 provider）：
 *
 *   ZIWEI_ASK_PROVIDER   openai | anthropic | echo   （必填，用来显式选择端点）
 *   ZIWEI_ASK_BASE_URL   OpenAI 兼容端点的 API 根地址（provider=openai 时必填）
 *   ZIWEI_ASK_API_KEY    API key（provider=openai / anthropic 时必填）
 *   ZIWEI_ASK_MODEL      模型名（provider=openai / anthropic 时必填）
 *   ZIWEI_ASK_MAX_TOKENS 单次输出上限（可选，默认 8000）
 *   ZIWEI_ASK_TIMEOUT_MS 流式空闲超时（可选，默认 180000）。注意语义是
 *                        「模型连续多久没有输出新内容就断开」，不是总时长上限。
 *
 * ⚠️ **max_tokens 的默认值为什么给到 8000**：
 *   带思维链的模型（MiniMax-M3 / DeepSeek-R1 / QwQ…）的**思考 token 吃满整个
 *   max_tokens 预算**。给小了会出现「content 为空、只有 reasoning」的返回
 *   （表现为回答莫名其妙地空掉），所以预算必须按「思考 + 正文」一起算。
 *
 * 读取时机：调用 `resolveProviderFromEnv()` 的那一刻。**不在 import 时读、不在 import 时联网。**
 */

import type { AskProvider } from '../types';
import { createAnthropicProvider } from './anthropic';
import { createEchoProvider } from './echo';
import { createOpenAICompatibleProvider } from './openai';

export type AskProviderKind = 'openai' | 'anthropic' | 'echo';

export interface ProviderEnvSnapshot {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * 单次输出 token 上限的默认值。
 *
 * 给到 8000 是因为带思维链的模型会把**思考 token 吃进同一个预算** ——
 * 给小了会出现「正文为空」的诡异返回。
 */
export const DEFAULT_MAX_TOKENS = 8000;

export interface ProviderEnvStatus {
  /** 是否可以构造出 provider */
  ok: boolean;
  /** 解析出的 provider 类型 */
  kind?: AskProviderKind;
  /** 缺失的环境变量名 */
  missing: string[];
  /** 面向人的中文说明（可直接展示） */
  message: string;
}

const PROVIDER_ALIASES: Record<string, AskProviderKind> = {
  openai: 'openai',
  'openai-compatible': 'openai',
  openaicompatible: 'openai',
  oai: 'openai',
  deepseek: 'openai',
  zhipu: 'openai',
  ollama: 'openai',
  vllm: 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
  echo: 'echo',
  local: 'echo',
};

/** 读取环境变量快照。 */
export function readProviderEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderEnvSnapshot {
  return {
    provider: env.ZIWEI_ASK_PROVIDER?.trim() || undefined,
    baseUrl: env.ZIWEI_ASK_BASE_URL?.trim() || undefined,
    apiKey: env.ZIWEI_ASK_API_KEY?.trim() || undefined,
    model: env.ZIWEI_ASK_MODEL?.trim() || undefined,
    maxTokens: (() => {
      const raw = env.ZIWEI_ASK_MAX_TOKENS?.trim();
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    })(),
    timeoutMs: (() => {
      const raw = env.ZIWEI_ASK_TIMEOUT_MS?.trim();
      if (!raw) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    })(),
  };
}

/**
 * 检查环境变量是否足以构造 provider，并给出明确的中文说明。
 * 不抛异常，调用方自己决定怎么处理。
 */
export function describeProviderEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderEnvStatus {
  const snap = readProviderEnv(env);

  if (!snap.provider) {
    return {
      ok: false,
      missing: ['ZIWEI_ASK_PROVIDER'],
      message:
        '追问层未配置模型 provider：请设置环境变量 ZIWEI_ASK_PROVIDER（可选值：openai | anthropic | echo）。' +
        '追问层默认不联网，也不会自动回退到任何默认 provider。',
    };
  }

  const kind = PROVIDER_ALIASES[snap.provider.toLowerCase()];
  if (!kind) {
    return {
      ok: false,
      missing: [],
      message:
        `未知的 ZIWEI_ASK_PROVIDER="${snap.provider}"。` +
        '可选值：openai（OpenAI 兼容协议，含 DeepSeek/智谱/vLLM/Ollama）、anthropic、echo（不联网本地桩）。',
    };
  }

  if (kind === 'echo') {
    return {
      ok: true,
      kind,
      missing: [],
      message: '已配置 echo provider（不联网本地桩），仅用于开发与自测。',
    };
  }

  const missing: string[] = [];
  if (kind === 'openai' && !snap.baseUrl) missing.push('ZIWEI_ASK_BASE_URL');
  if (!snap.apiKey) missing.push('ZIWEI_ASK_API_KEY');
  if (!snap.model) missing.push('ZIWEI_ASK_MODEL');

  if (missing.length > 0) {
    return {
      ok: false,
      kind,
      missing,
      message:
        `追问层 provider 配置不完整，缺少环境变量：${missing.join('、')}。` +
        `请设置后重试（当前 ZIWEI_ASK_PROVIDER="${snap.provider}"）。`,
    };
  }

  return {
    ok: true,
    kind,
    missing: [],
    message: `已配置 ${kind} provider（model=${snap.model}）。`,
  };
}

/**
 * 按环境变量构造 provider。
 *
 * **没配置就返回 undefined** —— 不静默失败，也不偷偷用某个默认 provider。
 * 想拿到具体缺什么，调用 `describeProviderEnv()`。
 */
export function resolveProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AskProvider | undefined {
  const status = describeProviderEnv(env);
  if (!status.ok) return undefined;

  const snap = readProviderEnv(env);
  switch (status.kind) {
    case 'echo':
      return createEchoProvider();
    case 'openai':
      return createOpenAICompatibleProvider({
        baseUrl: snap.baseUrl!,
        apiKey: snap.apiKey,
        model: snap.model!,
        ...(snap.maxTokens ? { defaultMaxTokens: snap.maxTokens } : {}),
        ...(snap.timeoutMs ? { timeoutMs: snap.timeoutMs } : {}),
      });
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: snap.apiKey!,
        model: snap.model!,
        ...(snap.maxTokens ? { defaultMaxTokens: snap.maxTokens } : {}),
      });
    default:
      return undefined;
  }
}
