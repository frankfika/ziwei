'use client';

/**
 * 命盘追问面板。
 *
 * 设计要点：
 *  · 回答区展示**原文引用**（维度名），让用户能自己去数据集里核对；
 *  · 机械自检的越界内容用醒目样式标出 —— 这是产品可信度的关键：
 *    宁可让用户看见「这条可能超出了你的盘面」，也不要静默糊过去；
 *  · provider 未配置 / 样本库未覆盖，**原样显示服务端给的说明**，
 *    不自己编措辞。
 */

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { askChart, type AskActionResult } from '@/app/ask-action';
import Markdown from './Markdown';

export interface AskPanelProps {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  /** 样本库未覆盖时为 false —— 此时不展示追问入口 */
  available: boolean;
  /** provider 是否已配置；未配置时仍展示入口，但先给软提示 */
  providerConfigured?: boolean;
  /** describeProviderEnv().message，可直接展示 */
  providerMessage?: string;
  /** 缺失的环境变量名 */
  providerMissing?: string[];
}

const PRESETS = [
  '这份命盘在职业方向上有什么特点？',
  '我的感情运势在原文里是怎么说的？',
  '财运方面，原文给了哪些倾向？',
];

type LocalError = {
  message: string;
  retryQuestion: string;
};

export default function AskPanel({
  year,
  month,
  day,
  hour,
  gender,
  available,
  providerConfigured = true,
  providerMessage,
  providerMissing = [],
}: AskPanelProps) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AskActionResult | null>(null);
  const [localError, setLocalError] = useState<LocalError | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const resultId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function expandFromHash() {
      if (window.location.hash !== '#ask-panel') return;
      setExpanded(true);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
    expandFromHash();
    window.addEventListener('hashchange', expandFromHash);
    return () => window.removeEventListener('hashchange', expandFromHash);
  }, []);

  function submit(q: string) {
    const text = q.trim();
    if (!text || pending || !providerConfigured) return;

    setQuestion(text);
    setResult(null);
    setLocalError(null);
    setExpanded(true);

    const fd = new FormData();
    fd.set('question', text);
    fd.set('year', String(year));
    fd.set('month', String(month));
    fd.set('day', String(day));
    fd.set('hour', String(hour));
    fd.set('gender', gender);

    startTransition(async () => {
      try {
        const r = await askChart(fd);
        setResult(r);
      } catch {
        setLocalError({
          message: '追问请求失败，可能是网络波动或服务暂时不可用。请稍后重试。',
          retryQuestion: text,
        });
      }
    });
  }

  if (!available) return null;

  const suspects = (() => {
    if (!result || result.status !== 'ok') return [];
    const v = result.verification;
    return [
      ...v.suspectStars.map((s) => `星曜「${s}」`),
      ...v.suspectPalaces.map((s) => `宫位「${s}」`),
      ...v.suspectPlacements.map((s) => `落宫「${s}」`),
    ];
  })();

  return (
    <div className="mt-14 print:hidden" id="ask-panel">
      <div className="mb-5 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="ask-panel-content"
          className="flex w-full items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zhu"
        >
          <span>
            <span className="block font-serif text-sm tracking-[0.2em] text-ink">命盘追问</span>
            <span className="mt-1 block text-2xs text-ink-3">
              依据引擎盘面 + 数据集原文
            </span>
          </span>
          <span className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-line px-3 py-1 text-2xs text-ink-2">
            {expanded ? '收起' : '展开'}
          </span>
        </button>
        {!expanded && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xs text-ink-3">试试：</span>
            {PRESETS.slice(0, 2).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                disabled={pending || !providerConfigured}
                className="max-w-full truncate rounded-full border border-line bg-surface px-3 py-2 min-h-9 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        id="ask-panel-content"
        hidden={!expanded}
        className="panel p-5 sm:p-6"
      >
        {!providerConfigured && (
          <div
            className="mb-5 rounded-lg border border-line bg-paper px-4 py-3"
            data-ask-provider="not-configured"
            role="status"
          >
            <p className="text-xs leading-relaxed text-ink-2">
              {providerMessage ??
                '追问层尚未配置模型 provider。排盘与数据集解读不受影响；配置环境变量后即可追问。'}
            </p>
            {providerMissing.length > 0 && (
              <p className="mt-1.5 text-2xs text-ink-3">
                需要设置：{providerMissing.join('、')}
              </p>
            )}
          </div>
        )}

        <label htmlFor="ask-question" className="field-label">
          你的问题
        </label>
        <textarea
          ref={textareaRef}
          id="ask-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="例如：这份命盘在职业方向上有什么特点？"
          className="field-input resize-y leading-relaxed"
          disabled={pending}
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submit(p)}
              disabled={pending || !providerConfigured}
              className="max-w-full truncate rounded-full border border-line bg-surface px-3 py-2 min-h-9 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => submit(question)}
          disabled={pending || !question.trim() || !providerConfigured}
          className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {pending
            ? '正在查证…'
            : providerConfigured
              ? '追问'
              : '请先配置追问模型'}
        </button>

        <div id={resultId} aria-live="polite" aria-busy={pending}>
          {pending && (
            <div
              className="mt-6 flex items-center gap-3 rounded-lg border border-line bg-paper px-4 py-3"
              role="status"
            >
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-zhu"
                aria-hidden="true"
              />
              <p className="text-xs text-ink-2">
                正在核对盘面并检索数据集原文，通常需要几秒…
              </p>
            </div>
          )}

          {localError && (
            <div
              className="mt-6 rounded-lg border border-zhu/25 bg-zhu-soft/40 px-4 py-3"
              data-ask-state="error"
              role="alert"
            >
              <p className="text-xs leading-relaxed text-ink-2">{localError.message}</p>
              <button
                type="button"
                onClick={() => submit(localError.retryQuestion)}
                disabled={pending}
                className="mt-3 rounded-lg border border-zhu/30 bg-surface px-3 py-2 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                重试
              </button>
            </div>
          )}

          {result && (
            <div
              className="mt-6 border-t border-line pt-5"
              data-ask-state={result.status}
            >
              {result.status === 'ok' && (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-ink-3">
                    <span>模型 {result.model ?? result.provider}</span>
                    {result.usage?.totalTokens && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">
                          {result.usage.totalTokens} tokens
                        </span>
                      </>
                    )}
                    {result.citedDimensions.length > 0 && (
                      <>
                        <span>·</span>
                        <span>引用维度：{result.citedDimensions.join('、')}</span>
                      </>
                    )}
                  </div>

                  <div
                    className="text-sm leading-[1.95] text-ink-2"
                    data-ask-answer=""
                  >
                    <Markdown text={result.answer} />
                  </div>

                  {suspects.length > 0 ? (
                    <div
                      className="mt-5 rounded-lg border border-zhu/30 bg-zhu-soft/50 px-4 py-3"
                      data-ask-verification="warn"
                      role="alert"
                    >
                      <p className="text-xs font-medium text-zhu">
                        ⚠ 机械自检：以下内容不在你的盘面中，请谨慎参考
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-2xs text-ink-2">
                        {suspects.map((s) => (
                          <li key={s}>· {s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p
                      className="mt-5 text-2xs text-ink-3"
                      data-ask-verification="clean"
                    >
                      ✓ 机械自检：未发现盘面外的星曜 / 宫位
                    </p>
                  )}
                </>
              )}

              {result.status === 'not-covered' && (
                <div
                  className="rounded-lg border border-line bg-paper px-4 py-3"
                  role="status"
                >
                  <p className="text-xs text-ink-2">{result.message}</p>
                </div>
              )}

              {result.status === 'not-configured' && (
                <div
                  className="rounded-lg border border-line bg-paper px-4 py-3"
                  role="status"
                >
                  <p className="text-xs text-ink-2">{result.message}</p>
                  {result.missing.length > 0 && (
                    <p className="mt-2 text-2xs text-ink-3">
                      需要设置：{result.missing.join('、')}
                    </p>
                  )}
                </div>
              )}

              {result.status === 'error' && (
                <div
                  className="rounded-lg border border-zhu/25 bg-zhu-soft/40 px-4 py-3"
                  role="alert"
                >
                  <p className="text-xs text-ink-2">{result.message}</p>
                  <button
                    type="button"
                    onClick={() => submit(question)}
                    disabled={pending}
                    className="mt-3 rounded-lg border border-zhu/30 bg-surface px-3 py-2 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                  >
                    重试
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">
        追问只依据本盘盘面与数据集原文作答；材料未写的内容会明确说明「原文未写」。
        不构成医疗、法律或投资建议。
      </p>
    </div>
  );
}
