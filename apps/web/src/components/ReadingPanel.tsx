'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import Markdown from './Markdown';
import { LiuNianCard } from './FortuneCard';
import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import { DURATION, motionStyle, preferredScrollBehavior } from '@/lib/motion';

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
  citationNotice,
  onAskFollowUp,
  onAskTime,
  liunian = null,
  palaces = [],
}: {
  dimensions: ReadingDimensionData[];
  /** 保留：父组件仍在传。面板只展示「本维」字数，不再展示总字数。 */
  totalChars: number;
  citationNotice?: CitationNotice;
  /** 「就此追问」：带着当前解读维度跳到追问 tab */
  onAskFollowUp?: (dim: { key: string; label: string }) => void;
  /** 「就今年追问」：带流年时间焦点发起追问 */
  onAskTime?: (time: 'liunian' | 'daxian') => void;
  /** 今年流年：解读 tab 顶部先给一张运势卡 */
  liunian?: ChartFortuneLayer | null;
  palaces?: ChartPalace[];
}) {
  const [active, setActive] = useState(dimensions[0]?.key ?? '');
  const current = dimensions.find((d) => d.key === active) ?? dimensions[0];
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // 首屏不滚动：只有用户主动切维度才把标签滚进视野
  const userDriven = useRef(false);

  useEffect(() => {
    if (!userDriven.current) return;
    const el = tabRefs.current[active];
    if (!el) return;
    // 只做横向居中；block: 'nearest' 保证不会把整页往下推
    el.scrollIntoView({ behavior: preferredScrollBehavior(), inline: 'center', block: 'nearest' });
  }, [active]);

  if (dimensions.length === 0) {
    return (
      <div>
        <div className="mb-4 border-b border-line pb-3">
          <h2 className="text-sm tracking-[0.2em] text-ink">十三维解读</h2>
        </div>
        <div
          className="rounded-lg border border-lineSoft bg-surface-2 px-4 py-6 text-center"
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
    userDriven.current = true;
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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
        <h2 className="text-sm tracking-[0.2em] text-ink">十三维解读</h2>
        <p className="text-2xs tabular-nums text-ink-3">共 {dimensions.length} 维</p>
      </div>

      {/* 今年运势卡：解读 tab 顶部 —— 先看时间层，再看维度 */}
      {liunian && palaces.length > 0 && (
        <div className="mb-6">
          <LiuNianCard
            liunian={liunian}
            palaces={palaces}
            {...(onAskTime ? { onAsk: () => onAskTime('liunian') } : {})}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[9.5rem_minmax(0,1fr)] lg:items-start lg:gap-9">
        {/* 维度切换：移动端横向分段行悬浮在滚动容器顶部，桌面端左栏竖排悬浮跟随 */}
        <nav
          id="reading-dimensions"
          role="tablist"
          aria-label="解读维度"
          onKeyDown={onTabListKeyDown}
          className="sticky top-0 z-20 -mx-2 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-lineSoft bg-paper/95 px-2 pb-2 pt-2 backdrop-blur touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:z-auto lg:flex-col lg:overflow-visible lg:border-b-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none"
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
                onClick={() => {
                  userDriven.current = true;
                  setActive(d.key);
                }}
                aria-controls="reading-panel-active"
                id={`reading-tab-${d.key}`}
                className={`inline-flex shrink-0 items-baseline gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu lg:w-full ${
                  isActive
                    ? 'bg-zhu-soft text-zhu'
                    : 'text-ink-2 hover:bg-surface hover:text-ink'
                }`}
              >
                <span className="text-xs">{d.label}</span>
                <span className="text-2xs tabular-nums text-ink-3">{d.chars}</span>
              </button>
            );
          })}
        </nav>

        <article
          role="tabpanel"
          id="reading-panel-active"
          aria-labelledby={`reading-tab-${current.key}`}
          tabIndex={0}
          className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          <p className="sr-only" aria-live="polite">
            当前维度：{current.label}
          </p>
          {/* key 变化 → 重新挂载 → tab-crossfade 溶化（class 提供 keyframes，
              inline style 提供时长/缓动 —— 时长只有一个来源：DURATION.tab） */}
          <div key={current.key} className="tab-crossfade" style={motionStyle(DURATION.tab)}>
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-serif text-title font-semibold text-ink">{current.label}</h3>
              <span className="text-2xs tabular-nums text-ink-3">
                本维 {current.chars.toLocaleString('zh-CN')} 字
              </span>
              {onAskFollowUp && (
                <button
                  type="button"
                  onClick={() => onAskFollowUp({ key: current.key, label: current.label })}
                  className="ml-auto inline-flex min-h-8 shrink-0 items-center rounded-full border border-zhu/30 bg-surface px-3 py-1.5 text-2xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  就此追问
                </button>
              )}
            </div>
            {/* 阅读行宽收在 40em 左右：长文不再拉满整屏，一眼能扫完一行 */}
            {current.text.trim() ? (
              <div className="max-w-[40rem]">
                <Markdown text={current.text} />
              </div>
            ) : (
              <div
                className="rounded-lg border border-lineSoft bg-surface-2 px-4 py-6 text-center"
                role="status"
              >
                <p className="text-xs leading-relaxed text-ink-3">
                  该维度暂无正文可展示（可能已被引文降级清空）。可切换其他维度继续阅读。
                </p>
              </div>
            )}
          </div>

          {onAskFollowUp && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => onAskFollowUp({ key: current.key, label: current.label })}
                className="inline-flex min-h-9 items-center rounded-full border border-zhu/30 bg-surface px-4 py-2 text-2xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                就此追问 · 带着「{current.label}」继续问
              </button>
            </div>
          )}

          {/* 引文声明：读完正文后才出现，不把内容往下推 */}
          {citationNotice && citationNotice.totalCitations > 0 && (
            <p className="mt-8 flex flex-wrap items-baseline gap-x-2 border-t border-lineSoft pt-4 text-2xs leading-relaxed text-ink-3">
              <span>
                {citationNotice.mode === 'full' ? (
                  <>
                    解读中含《天纪》引文 {citationNotice.totalCitations} 处，授权范围仅限非商业用途；商用或对外分发前需切换为引文降级。
                  </>
                ) : (
                  <>解读中的《天纪》引文已做降级处理（{citationNotice.totalCitations} 处）。</>
                )}
              </span>
              <Link
                href="/about"
                className="shrink-0 text-ink-2 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                关于与口径
              </Link>
            </p>
          )}
          <div className="mt-8 border-t border-lineSoft pt-4 lg:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!prevDim}
                onClick={() => prevDim && (userDriven.current = true, setActive(prevDim.key))}
                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-line bg-surface-2 px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:flex-none"
              >
                {prevDim ? `上一维 · ${prevDim.label}` : '已是第一维'}
              </button>
              <button
                type="button"
                disabled={!nextDim}
                onClick={() => nextDim && (userDriven.current = true, setActive(nextDim.key))}
                className="inline-flex min-h-9 flex-1 items-center justify-center rounded-lg border border-line bg-surface-2 px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:flex-none"
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
