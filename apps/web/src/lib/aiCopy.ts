/**
 * AI 设置面板的界面文案（中文 / English）。
 * 面板是英文用户一定会碰到的地方（自带 Key），所以整份双语。
 */

import type { Lang } from './quotaCopy';

export interface AiCopy {
  title: string;
  collapse: string;
  unsaved: string;
  savedKeyIntro: string;
  newKeyIntro: string;
  kindLabel: string;
  kindOpenAi: string;
  kindAnthropic: string;
  kindEcho: string;
  baseUrlLabel: string;
  keyLabel: string;
  modelLabel: string;
  maxTokensLabel: string;
  maxTokensHint: string;
  save: string;
  saved: string;
  test: string;
  testing: string;
  clearBuiltin: string;
  clearDefault: string;
  testOk: (model: string) => string;
  testFail: (error: string) => string;
  unknownError: string;
  requestFailed: string;
}

const ZH: AiCopy = {
  title: 'AI 设置',
  collapse: '收起',
  unsaved: '表单有未保存的改动 —— 点「保存配置」才会生效。',
  savedKeyIntro: '下面是你已保存的 Key（改动后点保存才生效）：',
  newKeyIntro: '想换成自己的 Key？选个预设、填上 Key、保存：',
  kindLabel: '协议类型',
  kindOpenAi: 'OpenAI 兼容（含 DeepSeek / 智谱 / Kimi / Ollama）',
  kindAnthropic: 'Anthropic（Claude）',
  kindEcho: 'echo（不联网本地桩，仅调试）',
  baseUrlLabel: 'API 根地址',
  keyLabel: 'API Key',
  modelLabel: '模型名',
  maxTokensLabel: '单次输出上限（token）',
  maxTokensHint:
    '带思维链的模型（MiniMax-M3 / DeepSeek-R1 / QwQ 等）思考 token 与正文共用这份预算，给小了正文会空 —— 这类模型建议 20000 以上。默认 8000。',
  save: '保存配置',
  saved: '已保存',
  test: '测试连接',
  testing: '测试中…',
  clearBuiltin: '清除，改用内置 AI',
  clearDefault: '清除，改用默认',
  testOk: (model) => `✓ 连通有效 —— 端点返回了模型 ${model}。保存后追问就走这个 Key（不限量）。`,
  testFail: (error) => `✗ 没连通：${error}`,
  unknownError: '未知错误',
  requestFailed: '请求失败 —— 网络不通或服务暂不可用',
};

const EN: AiCopy = {
  title: 'AI settings',
  collapse: 'Collapse',
  unsaved: 'The form has unsaved changes — press Save to apply them.',
  savedKeyIntro: 'Your saved key (changes apply after you save):',
  newKeyIntro: 'Use your own key? Pick a preset, paste the key, save:',
  kindLabel: 'Protocol',
  kindOpenAi: 'OpenAI-compatible (DeepSeek / Zhipu / Kimi / Ollama)',
  kindAnthropic: 'Anthropic (Claude)',
  kindEcho: 'echo (local stub, no network — debugging only)',
  baseUrlLabel: 'API base URL',
  keyLabel: 'API key',
  modelLabel: 'Model',
  maxTokensLabel: 'Max output tokens',
  maxTokensHint:
    'Reasoning models (MiniMax-M3 / DeepSeek-R1 / QwQ…) share this budget between thinking and the answer — set it too low and the answer comes back empty. Use 20000+ for those. Default 8000.',
  save: 'Save',
  saved: 'Saved',
  test: 'Test connection',
  testing: 'Testing…',
  clearBuiltin: 'Clear, use the built-in AI',
  clearDefault: 'Clear, use the default',
  testOk: (model) => `✓ Connected — the endpoint answered with model ${model}. Save and your questions run on this key (no limit).`,
  testFail: (error) => `✗ Not reachable: ${error}`,
  unknownError: 'Unknown error',
  requestFailed: 'Request failed — network down or service unavailable',
};

export const AI_COPY: Record<Lang, AiCopy> = { zh: ZH, en: EN };
