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

import { useState, useTransition } from 'react';
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
  const [pending, startTransition] = useTransition();

  function submit(q: string) {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    const fd = new FormData();
    fd.set('question', text);
    fd.set('year', String(year));
    fd.set('month', String(month));
    fd.set('day', String(day));
    fd.set('hour', String(hour));
    fd.set('gender', gender);

    startTransition(async () => {
      const r = await askChart(fd);
      setResult(r);
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
    <div className="mt-14">
      <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-sm tracking-[0.2em] text-ink">命盘追问</h2>
        <p className="text-2xs text-ink-3">依据引擎盘面 + 数据集原文</p>
      </div>

      <div className="panel p-5 sm:p-6">
        {!providerConfigured && (
          <div
            className="mb-5 rounded-lg border border-line bg-paper px-4 py-3"
            data-ask-provider="not-configured"
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
          id="ask-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="例如：这份命盘在职业方向上有什么特点？"
          className="field-input resize-y leading-relaxed"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submit(p)}
              disabled={pending || !providerConfigured}
              className="rounded-full border border-line px-3 py-1 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => submit(question)}
          disabled={pending || !question.trim() || !providerConfigured}
          className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending
            ? '正在查证…'
            : providerConfigured
              ? '追问'
              : '请先配置追问模型'}
        </button>

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
              <div className="rounded-lg border border-line bg-paper px-4 py-3">
                <p className="text-xs text-ink-2">{result.message}</p>
              </div>
            )}

            {result.status === 'not-configured' && (
              <div className="rounded-lg border border-line bg-paper px-4 py-3">
                <p className="text-xs text-ink-2">{result.message}</p>
                {result.missing.length > 0 && (
                  <p className="mt-2 text-2xs text-ink-3">
                    需要设置：{result.missing.join('、')}
                  </p>
                )}
              </div>
            )}

            {result.status === 'error' && (
              <div className="rounded-lg border border-zhu/25 bg-zhu-soft/40 px-4 py-3">
                <p className="text-xs text-ink-2">{result.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">
        追问只依据本盘盘面与数据集原文作答；材料未写的内容会明确说明「原文未写」。
        不构成医疗、法律或投资建议。
      </p>
    </div>
  );
}
