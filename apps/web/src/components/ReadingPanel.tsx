'use client';

import { useState } from 'react';
import Markdown from './Markdown';

export interface ReadingDimensionData {
  key: string;
  label: string;
  text: string;
  chars: number;
}

export interface CitationNotice {
  mode: 'full' | 'inline' | 'drop-line';
  modeLabel: string;
  totalCitations: number;
  redactedDims: number;
}

export default function ReadingPanel({
  dimensions,
  totalChars,
  citationNotice,
}: {
  dimensions: ReadingDimensionData[];
  totalChars: number;
  citationNotice?: CitationNotice;
}) {
  const [active, setActive] = useState(dimensions[0]?.key ?? '');
  const current = dimensions.find((d) => d.key === active) ?? dimensions[0];

  if (!current) return null;

  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
        <h2 className="font-serif text-sm tracking-[0.2em] text-ink">十三维解读</h2>
        <p className="text-2xs tabular-nums text-ink-3">
          {dimensions.length} 维 · 约 {totalChars.toLocaleString('zh-CN')} 字
        </p>
      </div>

      {citationNotice && citationNotice.totalCitations > 0 && (
        <div className="mb-5 rounded-lg border border-line bg-paper px-4 py-3">
          <p className="text-2xs leading-relaxed text-ink-3">
            {citationNotice.mode === 'full' ? (
              <>
                当前为<b className="text-ink-2">完整展示</b>模式：本文本含
                <b className="text-ink-2"> {citationNotice.totalCitations} </b>
                处受限引文片段（《天纪》原话及其出处标注）。这些引文属受限授权范围
                （CC BY-NC-SA，不可商用），
                <b className="text-ink-2">对外商业分发前须开启引文降级</b>
                （环境变量 <code className="text-ink-2">ZIWEI_CITATION_MODE=inline</code>）。
              </>
            ) : (
              <>
                当前为<b className="text-ink-2">引文降级</b>模式：
                原文 {citationNotice.totalCitations} 处受限引文片段已处理，
                涉及 {citationNotice.redactedDims} 个维度。
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[9.5rem_minmax(0,1fr)] lg:gap-9">
        {/* 维度切换：移动端横向滚动，桌面端竖排 */}
        <nav
          aria-label="解读维度"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {dimensions.map((d) => {
            const isActive = d.key === current.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setActive(d.key)}
                aria-current={isActive}
                className={`flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-left transition-colors duration-150 lg:w-full ${
                  isActive
                    ? 'border-zhu/40 bg-zhu-soft text-ink'
                    : 'border-transparent text-ink-2 hover:border-line hover:bg-surface'
                }`}
              >
                <span className="text-xs">{d.label}</span>
                <span
                  className={`text-2xs tabular-nums ${
                    isActive ? 'text-zhu/70' : 'text-ink-3'
                  }`}
                >
                  {d.chars}
                </span>
              </button>
            );
          })}
        </nav>

        <article className="min-w-0">
          <div className="mb-4 flex items-baseline gap-2">
            <h3 className="font-serif text-base font-semibold tracking-wide text-ink">
              {current.label}
            </h3>
            <span className="text-2xs text-ink-3">
              {current.chars.toLocaleString('zh-CN')} 字 · 原文来自开源解读数据集
            </span>
          </div>
          <Markdown text={current.text} />
        </article>
      </div>
    </div>
  );
}
