'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import type { ChartPalace } from '@ziwei/chart-engine';
import ChartBoard from './ChartBoard';
import ReadingPanel from './ReadingPanel';
import AskPanel, { type AskSeed } from './AskPanel';
import NotCoveredNotice from './NotCoveredNotice';
import ChartShareButton, {
  SUMMARY_CHIP_CLASS,
  type ChartShareButtonProps,
} from './ChartShareButton';
import type { ChartCenterInfo } from './CenterPanel';
import type { CitationMode } from '@/lib/citations';

/** 三个视图：命盘 / 解读 / 追问 */
export type ChartTabKey = 'chart' | 'reading' | 'ask';

/** 面板 id（保留 #chart-board / #reading；#ask-panel 由 AskPanel 自己渲染） */
const PANEL_ID: Record<ChartTabKey, string> = {
  chart: 'chart-board',
  reading: 'reading',
  ask: 'ask-tabpanel',
};

/** tab ⇄ hash（深链用 replaceState 同步，不制造历史堆栈） */
const TAB_HASH: Record<ChartTabKey, string> = {
  chart: '#chart-board',
  reading: '#reading',
  ask: '#ask-panel',
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

/** 署名行：底栏正上方，≤24px。实底，避免与上方滚动正文糊在一起。 */
const CREDIT_CLASS =
  'flex h-4 shrink-0 items-center gap-1 truncate bg-paper px-3 text-2xs leading-4 text-ink-3 md:px-0 print:hidden';

export default function ChartTabs({
  palaces,
  center,
  reading,
  ask,
  summary,
  details,
  share,
}: ChartTabsProps) {
  const [tab, setTab] = useState<ChartTabKey>('chart');
  /** 页内追问种子：解读维度 / 宫格「就此追问」带过来的焦点与首问 */
  const [askSeed, setAskSeed] = useState<AskSeed | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const seedFromDimension = (dim: { key: string; label: string }) => {
    setAskSeed({
      id: Date.now(),
      dimension: dim.key,
      label: dim.label,
      question: `帮我看看${dim.label}方面，原文是怎么说的？`,
    });
    selectTab('ask');
  };

  const seedFromPalace = (palaceName: string) => {
    const short = palaceName.replace(/宫$/, '');
    setAskSeed({
      id: Date.now(),
      palace: short,
      label: palaceName,
      question: `帮我看看我的${palaceName}。`,
    });
    selectTab('ask');
  };

  const tabs = useMemo(() => {
    const list: Array<{ key: ChartTabKey; label: string }> = [
      { key: 'chart', label: '命盘' },
      { key: 'reading', label: '解读' },
    ];
    if (reading.ok) list.push({ key: 'ask', label: '追问' });
    return list;
  }, [reading.ok]);

  // 初始 tab 由 hash 决定（SSR 先渲染命盘，挂载后再修正，避免 hydration 不一致）
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      if (hash === '#reading') setTab('reading');
      else if (hash === '#ask-panel' && reading.ok) setTab('ask');
      else setTab('chart');
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [reading.ok]);

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
            onNavigateTab={(t) => selectTab(t === 'ask' && !reading.ok ? 'reading' : t)}
            {...(reading.ok ? { onAskPalace: seedFromPalace } : {})}
          />
        </div>

        <div {...panelProps('reading')}>
          {reading.ok ? (
            <ReadingPanel
              dimensions={reading.dimensions ?? []}
              totalChars={reading.totalChars}
              {...(reading.citationNotice ? { citationNotice: reading.citationNotice } : {})}
              {...(reading.ok ? { onAskFollowUp: seedFromDimension } : {})}
            />
          ) : (
            <NotCoveredNotice
              message={reading.notCovered?.message ?? ''}
              availableYears={reading.notCovered?.availableYears ?? []}
            />
          )}
        </div>

        {reading.ok && (
          <div {...panelProps('ask')}>
            <AskPanel {...ask} {...(askSeed ? { seed: askSeed } : {})} />
          </div>
        )}
      </div>

      {/* ── 署名（CC BY 4.0 署名要求；移动端壳会盖住全局 footer） ─── */}
      <p className={CREDIT_CLASS}>
        <span className="truncate">解读数据：紫微斗数开源解读数据集 v4.0</span>
        <span aria-hidden="true">·</span>
        <Link
          href="/about"
          className="shrink-0 underline underline-offset-2 transition-colors hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          口径说明
        </Link>
        <span aria-hidden="true">·</span>
        <Link
          href="/about"
          className="shrink-0 underline underline-offset-2 transition-colors hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          免责声明
        </Link>
      </p>

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
