'use client';

/**
 * AI 配置面板 —— 让用户自己填 provider / base URL / key / 模型。
 * 配置存本机 localStorage；key 不上传到任何第三方，只在提问时随请求送到我们自己的服务端。
 *
 * 「现在到底在用谁」在面板顶部一行说清楚；「配的 key 有没有效」用测试连接一键验证。
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
import { useLang } from '@/lib/lang';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useQuotaStatus } from '@/lib/useQuota';
import { AI_COPY } from '@/lib/aiCopy';

type TestState =
  | { phase: 'idle' }
  | { phase: 'testing' }
  | { phase: 'ok'; model: string }
  | { phase: 'fail'; error: string };

export default function AiConfigPanel({
  onClose,
  serverAiReady = false,
  serverModel,
}: {
  onClose: () => void;
  /** 服务端有没有配内置 AI（决定「清除后用什么」的提示） */
  serverAiReady?: boolean;
  /** 服务端内置 AI 的模型名（展示用） */
  serverModel?: string;
}) {
  const [cfg, setCfg] = useState<UserProviderConfig>({
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxTokens: 8000,
  });
  /** 已保存生效的配置 ——「现在在用谁」只认它，不认编辑中的表单 */
  const [savedCfg, setSavedCfg] = useState<UserProviderConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [test, setTest] = useState<TestState>({ phase: 'idle' });
  // 额度相关文案：中英可切；额度上限以服务端为准
  const [lang] = useLang();
  const quota = useQuotaStatus();
  const copy = QUOTA_COPY[lang];
  const ai = AI_COPY[lang];

  useEffect(() => {
    const existing = readUserConfig();
    setSavedCfg(existing);
    if (existing) {
      setCfg(existing);
      setHasConfig(true);
    }
  }, []);

  /** 表单和已保存配置是否有差异（决定要不要提示「还没保存」） */
  const dirty = hasConfig && JSON.stringify(cfg) !== JSON.stringify(savedCfg);

  const update = (patch: Partial<UserProviderConfig>) => {
    setCfg((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setTest({ phase: 'idle' });
  };

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    update({ kind: p.kind, baseUrl: p.baseUrl, model: p.model });
  };

  const save = () => {
    // echo 是不联网的调试桩，不需要 key；其余协议缺 key/模型名直接不保存
    if (cfg.kind !== 'echo' && (!cfg.apiKey.trim() || !cfg.model.trim())) return;
    if (!cfg.model.trim()) return;
    writeUserConfig(cfg);
    setSavedCfg(cfg);
    setHasConfig(true);
    setSaved(true);
    // 让用户看清「已保存」再自动收起，不用再手动点收起
    window.setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  const runTest = async () => {
    setTest({ phase: 'testing' });
    try {
      const fd = new FormData();
      fd.set('kind', cfg.kind);
      fd.set('key', cfg.apiKey);
      fd.set('model', cfg.model);
      fd.set('baseUrl', cfg.baseUrl);
      const r = await fetch('/api/ai-test', { method: 'POST', body: fd });
      const j = (await r.json()) as { ok: boolean; model?: string; error?: string };
      setTest(j.ok ? { phase: 'ok', model: j.model ?? cfg.model } : { phase: 'fail', error: j.error ?? ai.unknownError });
    } catch {
      setTest({ phase: 'fail', error: ai.requestFailed });
    }
  };

  const clear = () => {
    clearUserConfig();
    setSavedCfg(null);
    setHasConfig(false);
    setCfg((prev) => ({ ...prev, apiKey: '' }));
    setTest({ phase: 'idle' });
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4" data-ai-config>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-ink">{ai.title}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-8 items-center rounded-md px-2 py-1 text-2xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            {ai.collapse}
          </button>
        </div>
      </div>

      {/* 现在到底在用谁 —— 只认已保存的配置；表单有未保存的改动时明确说出来 */}
      <div className="mb-3 rounded-lg border border-lineSoft bg-paper/60 px-3 py-2.5" data-ai-active>
        {savedCfg ? (
          <>
            <p className="text-xs leading-relaxed text-ink">{copy.activeUser(savedCfg.model)}</p>
            {dirty && (
              <p className="mt-1 text-2xs text-zhu">
                {ai.unsaved}
              </p>
            )}
          </>
        ) : serverAiReady ? (
          <p className="text-xs leading-relaxed text-ink">
            {copy.activeBuiltin(serverModel ?? '内置模型', quota.limit)}
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-ink">{copy.noAiHint}</p>
        )}
      </div>

      <p className="mb-3 text-2xs leading-relaxed text-ink-2">{copy.ownKeyNote}</p>

      {/* 预设：只是快速填充，不代表「正在用」——没保存过配置时一个都不高亮，避免误会 */}
      <p className="mb-2 text-2xs text-ink-2">
        {hasConfig
          ? ai.savedKeyIntro
          : ai.newKeyIntro}
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            title={p.hint}
            className={`rounded-full border px-2.5 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
              hasConfig && cfg.kind === p.kind && cfg.baseUrl === p.baseUrl
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
          {ai.kindLabel}
        </label>
        <select
          id="ai-kind"
          value={cfg.kind}
          onChange={(e) => update({ kind: e.target.value as UserProviderKind })}
          className="field-input"
        >
          <option value="openai">{ai.kindOpenAi}</option>
          <option value="anthropic">{ai.kindAnthropic}</option>
          <option value="echo">{ai.kindEcho}</option>
        </select>
      </div>

      {/* Base URL */}
      {cfg.kind !== 'echo' && (
        <div className="mb-2">
          <label className="field-label" htmlFor="ai-base-url">
            {ai.baseUrlLabel}
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
            {ai.keyLabel}
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
            {ai.modelLabel}
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
            {ai.maxTokensLabel}
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
          <p className="mt-1 text-2xs leading-relaxed text-ink-2">
            {ai.maxTokensHint}
          </p>
        </div>
      )}

      {/* 操作行：保存 + 测试连接 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={cfg.kind !== 'echo' && (!cfg.apiKey.trim() || !cfg.model.trim())}
          className="btn-primary !w-auto !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saved ? ai.saved : ai.save}
        </button>
        <button
          type="button"
          onClick={runTest}
          disabled={cfg.kind !== 'echo' && (!cfg.apiKey.trim() || !cfg.model.trim()) || test.phase === 'testing'}
          data-ai-test-button
          className="inline-flex min-h-9 items-center rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-2 text-xs text-zhu transition-colors hover:border-zhu disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {test.phase === 'testing' ? ai.testing : ai.test}
        </button>
        {hasConfig && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            {serverAiReady ? ai.clearBuiltin : ai.clearDefault}
          </button>
        )}
      </div>

      {/* 测试结果：直接告诉用户 key 有没有效 */}
      {test.phase === 'ok' && (
        <p className="mt-2.5 rounded-lg border border-hua-lu/30 bg-hua-lu/10 px-3 py-2 text-xs text-hua-lu" data-ai-test-ok role="status">
          {ai.testOk(test.model)}
        </p>
      )}
      {test.phase === 'fail' && (
        <p className="mt-2.5 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger" data-ai-test-fail role="alert">
          {ai.testFail(test.error)}
        </p>
      )}
    </div>
  );
}
