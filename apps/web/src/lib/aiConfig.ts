'use client';

/**
 * 用户自配的 AI provider 配置 —— 存在浏览器 localStorage，不上传。
 *
 * key 只在本机，服务端每次请求时按这里的配置临时构造 provider（不落盘、不进日志）。
 * 没配就用服务端环境变量（ZIWEI_ASK_*），两者都没配则追问功能不可用。
 */

export type UserProviderKind = 'openai' | 'anthropic' | 'echo';

export interface UserProviderConfig {
  kind: UserProviderKind;
  /** OpenAI 兼容端点根地址（如 https://api.deepseek.com/v1） */
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

const STORAGE_KEY = 'ziwei_ai_config';

export const DEFAULT_CONFIG: UserProviderConfig = {
  kind: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 8000,
};

/** 常见端点的预设，省得手打 */
export const PRESETS: Array<{ label: string; kind: UserProviderKind; baseUrl: string; model: string; hint: string }> = [
  { label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: '官方' },
  { label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '国产，便宜' },
  { label: '智谱 GLM', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: '国产' },
  { label: 'MiniMax', kind: 'openai', baseUrl: 'https://api.minimaxi.com/v1', model: 'MiniMax-M1', hint: '国产，M1 快（M3 思维链慢）' },
  { label: '月之暗面 Kimi', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '长文本' },
  { label: 'Anthropic', kind: 'anthropic', baseUrl: '', model: 'claude-sonnet-5', hint: 'Claude' },
  { label: '本地 Ollama', kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b', hint: '不联网' },
];

export function readUserConfig(): UserProviderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<UserProviderConfig>;
    if (!v || typeof v !== 'object') return null;
    const kind: UserProviderKind =
      v.kind === 'anthropic' || v.kind === 'echo' ? v.kind : 'openai';
    if (!v.apiKey || !v.model) return null;
    return {
      kind,
      baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl : '',
      apiKey: v.apiKey,
      model: v.model,
      maxTokens: typeof v.maxTokens === 'number' && v.maxTokens > 0 ? v.maxTokens : 8000,
    };
  } catch {
    return null;
  }
}

export function writeUserConfig(cfg: UserProviderConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    /* 隐私模式忽略 */
  }
}

export function clearUserConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}
