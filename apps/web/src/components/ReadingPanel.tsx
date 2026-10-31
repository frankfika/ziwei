'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Markdown from './Markdown';
import { preferredScrollBehavior } from '@/lib/motion';

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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = tabRefs.current[active];
    if (!el) return;
    const behavior = preferredScrollBehavior();
    el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
    if (window.matchMedia('(max-width: 1023px)').matches) {
      articleRef.current?.scrollIntoView({ behavior, block: 'start' });
    }
  }, [active]);

  if (dimensions.length === 0) {
    return (
      <div>
        <div className="mb-5 flex items-baseline justify-between border-b border-line pb-3">
          <h2 className="font-serif text-sm tracking-[0.2em] text-ink">十三维解读</h2>
        </div>
        <div
          className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center"
          role="status"
        >
          <p className="text-xs leading-relaxed text-ink-3">
            暂无解读维度可展示。可能是样本未覆盖，或引文处理后无可用正文。
          </p>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const panel = current;
  const activeIndex = dimensions.findIndex((d) => d.key === panel.key);
  const prevDim = activeIndex > 0 ? dimensions[activeIndex - 1] : null;
  const nextDim =
    activeIndex >= 0 && activeIndex < dimensions.length - 1
      ? dimensions[activeIndex + 1]
      : null;

  function focusDimension(index: number) {
    const next = dimensions[(index + dimensions.length) % dimensions.length];
    if (!next) return;
    setActive(next.key);
    window.requestAnimationFrame(() => tabRefs.current[next.key]?.focus());
  }

  function onTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const idx = dimensions.findIndex((d) => d.key === panel.key);
      focusDimension(idx + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const idx = dimensions.findIndex((d) => d.key === panel.key);
      focusDimension(idx - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusDimension(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusDimension(dimensions.length - 1);
    }
  }

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
                解读中含《天纪》引文 {citationNotice.totalCitations} 处，授权范围仅限非商业用途。
                商用或对外分发前需切换为引文降级，详见「关于与口径」。
              </>
            ) : (
              <>
                解读中的《天纪》引文已做降级处理（{citationNotice.totalCitations} 处）。
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[9.5rem_minmax(0,1fr)] lg:gap-9">
        {/* 维度切换：移动端横向滚动并吸顶，桌面端竖排 */}
        <nav
          id="reading-dimensions"
          role="tablist"
          aria-label="解读维度"
          onKeyDown={onTabListKeyDown}
          className="sticky top-14 z-30 -mx-1 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-line/80 bg-paper/95 px-1 py-2 backdrop-blur touch-pan-x lg:static lg:mx-0 lg:flex-col lg:overflow-visible lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none scroll-mt-14"
        >
          {dimensions.map((d) => {
            const isActive = d.key === current.key;
            return (
              <button
                key={d.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[d.key] = el;
                }}
                onClick={() => setActive(d.key)}
                aria-controls="reading-panel-active"
                id={`reading-tab-${d.key}`}
                className={`inline-flex min-h-9 shrink-0 items-baseline gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu lg:w-full ${
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

        <article
          ref={articleRef}
          role="tabpanel"
          id="reading-panel-active"
          aria-labelledby={`reading-tab-${current.key}`}
          tabIndex={0}
          className="min-w-0 scroll-mt-28 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          <p className="sr-only" aria-live="polite">
            当前维度：{current.label}
          </p>
          <div className="mb-4 flex flex-wrap items-baseline gap-2">
            <h3 className="font-serif text-base font-semibold tracking-wide text-ink sm:text-lg">
              {current.label}
            </h3>
            <span className="text-2xs text-ink-3">
              {current.chars.toLocaleString('zh-CN')} 字
            </span>
          </div>
          {current.text.trim() ? (
            <Markdown text={current.text} />
          ) : (
            <div
              className="rounded-lg border border-dashed border-line bg-paper px-4 py-6 text-center"
              role="status"
            >
              <p className="text-xs leading-relaxed text-ink-3">
                该维度暂无正文可展示（可能已被引文降级清空）。可切换其他维度继续阅读。
              </p>
            </div>
          )}
          <div className="mt-8 border-t border-lineSoft pt-4 lg:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!prevDim}
                onClick={() => prevDim && setActive(prevDim.key)}
                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:flex-none"
              >
                {prevDim ? `上一维 · ${prevDim.label}` : '已是第一维'}
              </button>
              <button
                type="button"
                disabled={!nextDim}
                onClick={() => nextDim && setActive(nextDim.key)}
                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-line bg-surface px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:flex-none"
              >
                {nextDim ? `下一维 · ${nextDim.label}` : '已是最后一维'}
              </button>
            </div>
            <p className="mt-3">
              <a
                href="#reading-dimensions"
                className="text-2xs text-ink-3 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                回到维度列表
              </a>
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
