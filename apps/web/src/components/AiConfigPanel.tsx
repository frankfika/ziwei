'use client';

/**
 * AI 配置面板 —— 让用户自己填 provider / base URL / key / 模型。
 * 配置存本机 localStorage；key 不上传到任何第三方，只在提问时随请求送到我们自己的服务端。
 */

import { useEffect, useState } from 'react';
import {
  PRESETS,
  clearUserConfig,
  readUserConfig,
  writeUserConfig,
  type UserProviderConfig,
  type UserProviderKind,
} from '@/lib/aiConfig';

export default function AiConfigPanel({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<UserProviderConfig>({
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxTokens: 8000,
  });
  const [saved, setSaved] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    const existing = readUserConfig();
    if (existing) {
      setCfg(existing);
      setHasConfig(true);
    }
  }, []);

  const update = (patch: Partial<UserProviderConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    update({ kind: p.kind, baseUrl: p.baseUrl, model: p.model });
  };

  const save = () => {
    if (!cfg.apiKey.trim() || !cfg.model.trim()) return;
    writeUserConfig(cfg);
    setHasConfig(true);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const clear = () => {
    clearUserConfig();
    setHasConfig(false);
    setCfg((prev) => ({ ...prev, apiKey: '' }));
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4" data-ai-config>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-ink">AI 配置</h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-8 items-center rounded-md px-2 py-1 text-2xs text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          收起
        </button>
      </div>

      <p className="mb-3 text-2xs leading-relaxed text-ink-3">
        自己填一个模型端点就能用追问。配置只存在这台设备的浏览器里，不上传。
      </p>

      {/* 预设 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.hint}
            className={`rounded-full border px-2.5 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
              cfg.kind === p.kind && cfg.baseUrl === p.baseUrl
                ? 'border-zhu bg-zhu-soft text-ink'
                : 'border-line bg-paper text-ink-2 hover:border-ink-3'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 类型 */}
      <div className="mb-2">
        <label className="field-label" htmlFor="ai-kind">
          协议类型
        </label>
        <select
          id="ai-kind"
          value={cfg.kind}
          onChange={(e) => update({ kind: e.target.value as UserProviderKind })}
          className="field-input"
        >
          <option value="openai">OpenAI 兼容（含 DeepSeek / 智谱 / Kimi / Ollama）</option>
          <option value="anthropic">Anthropic（Claude）</option>
          <option value="echo">echo（不联网本地桩，仅调试）</option>
        </select>
      </div>

      {/* Base URL */}
      {cfg.kind !== 'echo' && (
        <div className="mb-2">
          <label className="field-label" htmlFor="ai-base-url">
            API 根地址
          </label>
          <input
            id="ai-base-url"
            value={cfg.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
            autoComplete="off"
            className="field-input font-mono text-xs"
          />
        </div>
      )}

      {/* Key */}
      {cfg.kind !== 'echo' && (
        <div className="mb-2">
          <label className="field-label" htmlFor="ai-key">
            API Key
          </label>
          <input
            id="ai-key"
            type="password"
            value={cfg.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
            autoComplete="off"
            className="field-input font-mono text-xs"
          />
        </div>
      )}

      {/* Model */}
      {cfg.kind !== 'echo' && (
        <div className="mb-2">
          <label className="field-label" htmlFor="ai-model">
            模型名
          </label>
          <input
            id="ai-model"
            value={cfg.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder="deepseek-chat"
            autoComplete="off"
            className="field-input font-mono text-xs"
          />
        </div>
      )}

      {/* Max tokens */}
      {cfg.kind !== 'echo' && (
        <div className="mb-3">
          <label className="field-label" htmlFor="ai-max-tokens">
            单次输出上限（token）
          </label>
          <input
            id="ai-max-tokens"
            type="number"
            min={256}
            max={64000}
            value={cfg.maxTokens}
            onChange={(e) => update({ maxTokens: Number(e.target.value) || 8000 })}
            className="field-input font-mono text-xs"
          />
          <p className="mt-1 text-2xs leading-relaxed text-ink-3">
            带思维链的模型（DeepSeek-R1 / QwQ 等）思考 token 与正文共用这份预算，给小了正文会空。默认 8000。
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={cfg.kind !== 'echo' && (!cfg.apiKey.trim() || !cfg.model.trim())}
          className="btn-primary !w-auto !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saved ? '已保存' : '保存配置'}
        </button>
        {hasConfig && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            清除，改用服务端默认
          </button>
        )}
      </div>

      {hasConfig && (
        <p className="mt-2 text-2xs text-ink-3">已启用自配模型：{cfg.model}</p>
      )}
    </div>
  );
}
