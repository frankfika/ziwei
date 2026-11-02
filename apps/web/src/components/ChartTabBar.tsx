'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import ChartBoard from './ChartBoard';
import ReadingPanel from './ReadingPanel';
import { dispatchZiweiAsk } from './FloatingAsk';
import NotCoveredNotice from './NotCoveredNotice';
import ChartShareButton, {
  SUMMARY_CHIP_CLASS,
  type ChartShareButtonProps,
} from './ChartShareButton';
import type { ChartCenterInfo, CurrentDaXianInfo } from './CenterPanel';
import type { CitationMode } from '@/lib/citations';

/** 三个视图：命盘 / 解读 / 追问 */
export type ChartTabKey = 'chart' | 'reading';

/** 面板 id（保留 #chart-board / #reading；#ask-panel 由 AskPanel 自己渲染） */
const PANEL_ID: Record<ChartTabKey, string> = {
  chart: 'chart-board',
  reading: 'reading',
};

/** tab ⇄ hash（深链用 replaceState 同步，不制造历史堆栈） */
const TAB_HASH: Record<ChartTabKey, string> = {
  chart: '#chart-board',
  reading: '#reading',
};

/** 解读维度（与 ReadingPanel 的入参同形，不依赖对方文件导出的类型名） */
export interface ChartReadingDimension {
  key: string;
  label: string;
  text: string;
  chars: number;
}

/** 引文声明 */
export interface ChartCitationNotice {
  mode: CitationMode;
  modeLabel: string;
  totalCitations: number;
  redactedDims: number;
}

export interface ChartTabsProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
  /** 流年运限层（今年，引擎 liuNianLayer 输出） */
  liunian?: ChartFortuneLayer | null;
  /** 流年 5 年层（前年~后年，可选年份） */
  liunianYears?: Array<ChartFortuneLayer & { year?: number }>;
  /** 大限运限层（引擎 daXianLayer 输出） */
  daXian?: ChartFortuneLayer | null;
  /** 12 个流月层（引擎 liuYueLayer 输出，服务端算好） */
  liuyueMonths?: ChartFortuneLayer[];
  /** 年度报告页链接 */
  reportUrl?: string;
  /** 当前大限摘要 */
  currentDaXian?: CurrentDaXianInfo | null;
  reading: {
    ok: boolean;
    dimensions?: ChartReadingDimension[];
    totalChars: number;
    citationNotice?: ChartCitationNotice;
    notCovered?: { message: string; availableYears: number[] };
  };
  ask: {
    year: number;
    month: number;
    day: number;
    hour: number;
    gender: 'male' | 'female';
    available: boolean;
    providerConfigured?: boolean;
  };
  /** 摘要行左侧内容（服务端渲染：生辰 + 晚子时标记） */
  summary: ReactNode;
  /** 「详情」折叠面板内容（服务端渲染：排盘日 / 时辰范围 / 真太阳时 / 入口链接） */
  details: ReactNode;
  /** 分享按钮参数 */
  share: ChartShareButtonProps;
}

/** 外壳：移动端固定一屏（header 56 + 摘要 56 + 底栏 56），桌面端回到正常流 */
const SHELL_CLASS =
  'fixed inset-x-0 top-14 bottom-[var(--chart-tab)] z-30 flex flex-col bg-paper pb-[env(safe-area-inset-bottom,_0px)] md:static md:inset-auto md:h-[calc(100dvh-7.5rem)] print:static print:!h-auto print:!pb-0';

/** 摘要行：≤56px */
const SUMMARY_CLASS = 'relative z-20 flex h-14 shrink-0 items-center gap-2 px-3 md:px-0';

/** tab 内容区：各自内部滚动，页面不跟着动 */
const CONTENT_CLASS =
  'flex min-h-0 flex-1 flex-col overflow-y-auto px-2 md:px-0 print:flex-none print:overflow-visible';

/** 署名行：底栏正上方，≤24px。实底，避免与上方滚动正文糊在一起。左侧留出悬浮球的位置。 */
const CREDIT_CLASS =
  'flex h-4 shrink-0 items-center gap-1 truncate bg-paper pl-16 pr-3 text-2xs leading-4 text-ink-3 md:px-0 print:hidden';

export default function ChartTabs({
  palaces,
  center,
  liunian = null,
  liunianYears,
  daXian = null,
  liuyueMonths,
  reportUrl,
  currentDaXian = null,
  reading,
  ask,
  summary,
  details,
  share,
}: ChartTabsProps) {
  const [tab, setTab] = useState<ChartTabKey>('chart');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /** 追问一律走左下角悬浮机器人（不跳转），这里派发事件带上当前盘 */
  const askEventBirth = {
    year: ask.year,
    month: ask.month,
    day: ask.day,
    hour: ask.hour,
    gender: ask.gender,
  };

  const seedFromDimension = (dim: { key: string; label: string }) => {
    dispatchZiweiAsk({
      question: `帮我看看${dim.label}方面，原文是怎么说的？`,
      dimension: dim.key,
      birth: askEventBirth,
    });
  };

  const seedFromPalace = (palaceName: string) => {
    dispatchZiweiAsk({
      question: `帮我看看我的${palaceName}。`,
      palace: palaceName.replace(/宫$/, ''),
      birth: askEventBirth,
    });
  };

  /** 中宫「就这步运追问」：时间层种子 */
  const seedFromTime = (time: 'liunian' | 'daxian') => {
    dispatchZiweiAsk({
      question:
        time === 'liunian'
          ? '今年流年整体如何？流年命宫和流年四化带来了什么？'
          : '当前这步大限整体如何？大限命宫和大限四化怎么看？',
      time,
      birth: askEventBirth,
    });
  };

  const tabs = useMemo(() => {
    return [
      { key: 'chart' as const, label: '命盘' },
      { key: 'reading' as const, label: '解读' },
    ];
  }, []);

  // 初始 tab 由 hash 决定（SSR 先渲染命盘，挂载后再修正，避免 hydration 不一致）
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      if (hash === '#reading') setTab('reading');
      else setTab('chart');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const selectTab = (next: ChartTabKey) => {
    setTab(next);
    const hash = TAB_HASH[next];
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.key === tab);
    if (index < 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next];
    selectTab(target.key);
    tabRefs.current[target.key]?.focus();
  };

  // 三个面板都挂载；非激活的 hidden + print:block（打印时仍能打出解读）
  const panelProps = (key: ChartTabKey) => {
    const active = tab === key;
    return {
      id: PANEL_ID[key],
      role: 'tabpanel' as const,
      'aria-labelledby': `${key}-tab`,
      hidden: !active,
      className: active
        ? 'flex min-h-0 flex-1 flex-col print:flex-none'
        : 'hidden print:block',
    };
  };

  return (
    <div className={SHELL_CLASS}>
      {/* ── 摘要行（单行 + 详情 / 分享折叠） ─────────────────────── */}
      <div className={SUMMARY_CLASS}>
        <div className="min-w-0 flex-1 truncate text-xs text-ink">{summary}</div>

        <details className="relative shrink-0">
          <summary className={SUMMARY_CHIP_CLASS}>详情</summary>
          <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-line bg-surface-2 p-3 shadow-[0_12px_40px_rgba(46,42,35,0.14)]">
            {details}
          </div>
        </details>

        <ChartShareButton {...share} />
      </div>

      {/* ── 三个面板：都挂载，非激活的 hidden（打印时 print:block） ─── */}
      <div className={CONTENT_CLASS}>
        <div {...panelProps('chart')}>
          <ChartBoard
            palaces={palaces}
            center={center}
            liunian={liunian}
            liunianYears={liunianYears}
            daXian={daXian}
            liuyueMonths={liuyueMonths}
            {...(reportUrl ? { reportUrl } : {})}
            daXianInfo={currentDaXian}
            onNavigateTab={(t) => selectTab(t === 'ask' ? 'reading' : t)}
            {...(reading.ok ? { onAskPalace: seedFromPalace, onAskTime: seedFromTime } : {})}
          />
        </div>

        <div {...panelProps('reading')}>
          {reading.ok ? (
            <ReadingPanel
              dimensions={reading.dimensions ?? []}
              totalChars={reading.totalChars}
              liunian={liunian}
              palaces={palaces}
              {...(reading.citationNotice ? { citationNotice: reading.citationNotice } : {})}
              {...(reading.ok ? { onAskFollowUp: seedFromDimension, onAskTime: seedFromTime } : {})}
            />
          ) : (
            <NotCoveredNotice
              message={reading.notCovered?.message ?? ''}
              availableYears={reading.notCovered?.availableYears ?? []}
            />
          )}
        </div>

      </div>

      {/* ── 底 Tab：命盘 | 解读 | 追问 ───────────────────────────── */}
      <div
        className="tab-bar print:hidden"
        role="tablist"
        aria-label="盘面视图"
        onKeyDown={onTabKeyDown}
      >
        <div className="mx-auto flex w-full max-w-7xl">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                id={`${t.key}-tab`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={PANEL_ID[t.key]}
                tabIndex={active ? 0 : -1}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                onClick={() => selectTab(t.key)}
                className={`relative flex h-14 flex-1 items-center justify-center text-xs tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu ${
                  active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-zhu"
                    aria-hidden="true"
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
