'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import PalaceCell, { GRID_POS, sanFangBranches, brightnessClass, SIHUA_CLASS, fortuneSiHuaOf } from './PalaceCell';
import CenterPanel, { type BoardLayer, type ChartCenterInfo, type CurrentDaXianInfo } from './CenterPanel';
import { useLang } from '@/lib/lang';
import { CHART_COPY, palaceLabel, siHuaLabel } from '@/lib/chartCopy';
import { useReducedMotion } from './ReducedMotion';
import Seal from './Seal';

/** 开盘仪式节奏（globals.css「开盘仪式」段的 200ms 时长对应 OPEN_REVEAL_MS）：
   边宫（8）→ 角宫（4）→ 中宫，两处换气各留 OPEN_BREATH_MS */
const OPEN_STEP_MS = 60;
const OPEN_BREATH_MS = 240;
const OPEN_REVEAL_MS = 200;
const OPEN_CENTER_MS = 12 * OPEN_STEP_MS + 2 * OPEN_BREATH_MS;
const OPEN_SEAL_MS = OPEN_CENTER_MS + 20;
/** 盘面四角的宫（离中宫最远，最后落定）—— GRID_POS 里 (1,1)(1,4)(4,1)(4,4) */
const OPEN_CORNER = new Set([5, 8, 2, 11]);

interface ChartBoardProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
  /** 中宫「看解读 / 去追问」跳到底部 tab */
  onNavigateTab?: (tab: 'reading' | 'ask') => void;
  /** 宫位详情 sheet 里「就此追问」本宫 */
  onAskPalace?: (palaceName: string) => void;
  /** 流年运限层（引擎生成，含该层十二宫名与四化落宫） */
  liunian?: ChartFortuneLayer | null;
  /** 流年 5 年层（前年~后年可选） */
  liunianYears?: Array<ChartFortuneLayer & { year?: number }>;
  /** 大限运限层 */
  daXian?: ChartFortuneLayer | null;
  /** 12 个流月层 */
  liuyueMonths?: ChartFortuneLayer[];
  /** 年度报告页链接 */
  reportUrl?: string;
  /** 当前大限摘要 */
  daXianInfo?: CurrentDaXianInfo | null;
  /** 「就这步运追问」 */
  onAskTime?: (time: 'liunian' | 'daxian') => void;
}

/** 四化图例（桌面一行 / 移动端 sheet 顶部共用）：字是数据集术语，tooltip 给英文 */
function sihuaLegend(copy: typeof CHART_COPY.zh) {
  return (
    <>
      <span className="chip-sihua border-hua-lu/40 bg-hua-lu/10 text-hua-lu" title={copy.siHuaTooltip('禄')}>禄</span>
      <span className="chip-sihua border-hua-quan/40 bg-hua-quan/10 text-hua-quan" title={copy.siHuaTooltip('权')}>权</span>
      <span className="chip-sihua border-hua-ke/40 bg-hua-ke/10 text-hua-ke" title={copy.siHuaTooltip('科')}>科</span>
      <span className="chip-sihua border-hua-ji/40 bg-hua-ji/10 text-hua-ji" title={copy.siHuaTooltip('忌')}>忌</span>
    </>
  );
}

export default function ChartBoard({
  palaces,
  center,
  onNavigateTab,
  onAskPalace,
  liunian = null,
  liunianYears,
  daXian = null,
  liuyueMonths,
  reportUrl,
  daXianInfo = null,
  onAskTime,
}: ChartBoardProps) {
  const [lang] = useLang();
  const copy = CHART_COPY[lang];
  const [selected, setSelected] = useState<number | null>(null);
  /** 时间轴叠加层：本命 / 大限 / 流年 */
  const [layer, setLayer] = useState<BoardLayer>('natal');
  /** 流月选中月份（1–12），默认当前农历月 */
  const [liuyueMonth, setLiuyueMonth] = useState(center.lunarMonth);
  /** 流年选中年份（liunianYears 下标），默认今年（2 = 中间） */
  const [liunianIdx, setLiunianIdx] = useState(2);
  /** 开盘仪式：reduced-motion 下整体节奏压到 1/4，其余一次播完即停 */
  const reducedMotion = useReducedMotion();
  /** 进场动画只播一次：播完摘掉 open-reveal class。
     必须这样 —— display:none 子树里的 CSS 动画不运行，网格从隐藏变可见时会重播，
     那些有延迟的宫格会在重播期间是空白（改视口 / 首次展开就会看到整盘缺几宫）。 */
  const [revealing, setRevealing] = useState(true);
  useEffect(() => {
    const t = setTimeout(
      () => setRevealing(false),
      reducedMotion ? 500 : OPEN_CENTER_MS + 400,
    );
    return () => clearTimeout(t);
  }, [reducedMotion]);
  const openStyle = (step: number) => {
    if (!revealing) return {};
    const raw =
      step * OPEN_STEP_MS +
      (step >= 8 ? OPEN_BREATH_MS : 0) +
      (step === 12 ? OPEN_BREATH_MS : 0);
    return { animationDelay: `${Math.round(raw * (reducedMotion ? 0.25 : 1))}ms` };
  };
  /** 钤印：开盘仪式末尾盖下（reduced-motion 下提早到 400ms） */
  const [seal, setSeal] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSeal(true), reducedMotion ? 400 : OPEN_SEAL_MS);
    return () => clearTimeout(t);
  }, [reducedMotion]);
  /** 当前叠加的运限层：本命=空，大限=大限层，流年=选中流年，流月=选中月层 */
  const fortune =
    layer === 'daxian' ? daXian
      : layer === 'liunian' ? liunianYears?.[liunianIdx] ?? liunian
        : layer === 'liuyue' ? liuyueMonths?.[liuyueMonth - 1] ?? null
          : null;

  const sanFang = selected === null ? null : new Set(sanFangBranches(selected));
  const selectedPalace = useMemo(
    () => (selected === null ? null : palaces.find((p) => p.branch === selected) ?? null),
    [palaces, selected],
  );

  const mingPalace = useMemo(() => palaces.find((p) => p.isMingGong) ?? null, [palaces]);
  const shenPalace = useMemo(() => palaces.find((p) => p.isShenGong) ?? null, [palaces]);
  const currentDaXian = useMemo(
    () => palaces.find((p) => p.isCurrentDaXian) ?? null,
    [palaces],
  );

  /** 开盘次序：命宫先亮 → 其余边宫沿十二支环绕展开 → 四角宫最后封边。
      命宫可能本身就在角上（网格 4×4 的角），所以它的键直接置 -1，压过"角宫靠后" */
  const openStep = useMemo(() => {
    const ming = mingPalace?.branch ?? 0;
    const order = Array.from({ length: 12 }, (_, i) => i).sort((a, b) => {
      const key = (b: number) =>
        b === ming ? -1 : (OPEN_CORNER.has(b) ? 1 : 0) * 100 + ((b - ming + 12) % 12);
      return key(a) - key(b);
    });
    return new Map(order.map((branch, step) => [branch, step]));
  }, [mingPalace]);

  // Escape 取消选中（不再有 sheet 需要关闭）
  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const toggleSelected = (branch: number) => {
    setSelected((prev) => (prev === branch ? null : branch));
  };

  const jumpChips: Array<{ key: string; label: string; branch: number; active: boolean }> = [
    { key: 'ming', label: palaceLabel('命宫', lang), branch: mingPalace?.branch ?? -1, active: selected === mingPalace?.branch },
    { key: 'shen', label: palaceLabel('身宫', lang), branch: shenPalace?.branch ?? -1, active: selected === shenPalace?.branch },
    { key: 'daxian', label: copy.currentDaXian, branch: currentDaXian?.branch ?? -1, active: selected === currentDaXian?.branch },
  ].filter((chip) => chip.branch >= 0);

  const centerPanel = (
    <CenterPanel
      palaces={palaces}
      info={center}
      chips={jumpChips}
      onJumpBranch={toggleSelected}
      {...(onNavigateTab ? { onNavigateTab } : {})}
      layer={layer}
      onLayerChange={setLayer}
      fortune={fortune}
      currentDaXian={daXianInfo}
      {...(onAskTime ? { onAskTime } : {})}
      liuyueMonth={liuyueMonth}
      onLiuyueMonthChange={setLiuyueMonth}
      liuyueLabels={liuyueMonths?.map((m) => m.label) ?? []}
      liunianIdx={liunianIdx}
      onLiunianIdxChange={setLiunianIdx}
      liunianLabels={liunianYears?.map((ly) => ly.label) ?? []}
      {...(reportUrl ? { reportUrl } : {})}
    />
  );

  /** 移动端中宫：紧凑控制区（时间轴 + 运限摘要 + 追问入口），常驻不藏 */
  const mobileCenter = (
    <CenterPanel
      palaces={palaces}
      info={center}
      chips={jumpChips}
      onJumpBranch={toggleSelected}
      {...(onNavigateTab ? { onNavigateTab } : {})}
      layer={layer}
      onLayerChange={setLayer}
      fortune={fortune}
      currentDaXian={daXianInfo}
      {...(onAskTime ? { onAskTime } : {})}
      liuyueMonth={liuyueMonth}
      onLiuyueMonthChange={setLiuyueMonth}
      liuyueLabels={liuyueMonths?.map((m) => m.label) ?? []}
      liunianIdx={liunianIdx}
      onLiunianIdxChange={setLiunianIdx}
      liunianLabels={liunianYears?.map((ly) => ly.label) ?? []}
      {...(reportUrl ? { reportUrl } : {})}
      compact
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col print:flex-none print:h-auto">
      {/* ── 移动端：紧凑四四方阵 ───────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col md:hidden">
        <div
          id="chart-board-grid"
          className="palace-grid grid min-h-0 flex-1 overflow-hidden rounded-2xl"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
          }}
          role="group"
          aria-label={copy.boardAria}
        >
          {palaces.map((palace) => {
            const [row, col] = GRID_POS[palace.branch];
            const active = selected === palace.branch;
            const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
            // 开盘动效：delayed .open-reveal（见下 className），与状态变化无关，只播一次
            const openReveal = revealing ? 'open-reveal' : '';
            const fortuneName =
              layer === 'natal'
                ? null
                : fortune?.palaces.find((p) => p.branch === palace.branch)?.name ?? null;
            const major = palace.stars.filter((s) => s.type === 'major');
            const minor = palace.stars.filter((s) => s.type === 'minor');
            const lucky = palace.stars.filter((s) => s.type === 'lucky');
            const sha = palace.stars.filter((s) => s.type === 'sha');
            // palace-breathe / sanfang-fade：class 增删才重播 keyframes，
            // 所以呼吸与淡入只在「状态刚变」时各播一次
            const stateClass = active
              ? 'is-selected palace-breathe'
              : inSan
                ? 'is-sanfang sanfang-fade'
                : '';
            // 时间轴叠加层：流年命宫鎏金描边 / 大限命宫淡紫底
            const layerMark = [
              layer === 'liunian' && fortune && palace.branch === fortune.mingBranch
                ? 'is-liunian-ming'
                : '',
              layer === 'daxian' && fortune && palace.branch === fortune.mingBranch
                ? 'is-daxian-ming'
                : '',
            ]
              .filter(Boolean)
              .join(' ');


            return (
              <button
                key={palace.branch}
                type="button"
                style={{ ...openStyle(openStep.get(palace.branch) ?? 0), gridRow: row, gridColumn: col }}
                onClick={() => toggleSelected(palace.branch)}                aria-pressed={active}
                aria-label={[
                  palaceLabel(palace.name, lang),
                  copy.majorStars(major.map((s) => s.name).join('、') || copy.emptyPalace),
                  palace.isMingGong ? copy.mingGong : null,
                  palace.isShenGong ? copy.shenGong : null,
                  active ? copy.selected : null,
                  inSan ? copy.sanFangLink : null,
                ]
                  .filter(Boolean)
                  .join(copy.listSeparator)}
                className={`palace-cell ${stateClass} ${openReveal} ${layerMark} ${palace.isMingGong ? 'is-ming-gong' : ''} flex min-h-0 flex-col items-start gap-0.5 overflow-hidden p-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu`}
              >
                <span className="flex w-full shrink-0 items-baseline justify-between gap-1">
                  <span className="flex min-w-0 items-baseline gap-1">
                    <span
                      className={`min-w-0 text-[10px] font-medium leading-tight ${
                        palace.isMingGong
                          ? 'text-zhu'
                          : palace.isShenGong
                            ? 'text-hua-quan'
                            : 'text-ink-2'
                      }`}
                    >
                      {palaceLabel(palace.name, lang)}
                    </span>
                    {/* 运限层宫名：本命宫在流年/大限里叫什么 */}
                    {fortuneName && fortuneName !== palace.name && (
                      <span
                        className="shrink-0 rounded-sm border border-hua-ke/40 bg-hua-ke/10 px-0.5 text-[8px] leading-none text-hua-ke"
                        title={copy.layerPalaceTitle(
                          fortune?.kind === 'liunian' ? copy.liuNian : copy.daXian,
                          palaceLabel(fortuneName, lang),
                        )}
                      >
                        {fortuneName.replace('宫', '')}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[9px] leading-tight text-ink-3">
                    {palace.stemName}
                    {palace.branchName}
                  </span>
                </span>

                {/* 主星区：宫内主星多时格内滚动，不撑破盘 */}
                <span className="flex w-full min-h-0 flex-1 flex-col gap-px overflow-y-auto">
                  {major.length === 0 ? (
                    <span className="text-[10px] text-ink-3">{copy.emptyPalace}</span>
                  ) : (
                    major.map((star) => {
                      const lnMark =
                        layer === 'natal' ? null : fortuneSiHuaOf(star.name, fortune);
                      return (
                        <span
                          key={star.name}
                          className="flex items-baseline gap-0.5 leading-tight"
                        >
                          <span
                            className={`text-[12px] font-semibold ${brightnessClass(star.brightnessRaw)}`}
                          >
                            {star.name}
                          </span>
                          {star.siHua && (
                            <span
                              className={`chip-sihua px-1 text-[9px] leading-none ${SIHUA_CLASS[star.siHua] ?? 'border-line text-ink-3'}`}
                            >
                              {star.siHua}
                            </span>
                          )}
                          {lnMark && (
                            <span
                              className={`chip-sihua px-1 text-[9px] leading-none ${SIHUA_CLASS[lnMark] ?? 'border-line text-ink-3'}`}
                              title={copy.siHuaOfTitle(
                                fortune?.kind === 'liunian' ? copy.liuNian : copy.daXian,
                                lnMark,
                              )}
                            >
                              {fortune?.kind === 'liunian' ? '流' : '限'}
                              {lnMark}
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                  {/* 辅星 / 吉星 / 煞星：直接列在盘上，不藏进详情 */}
                  {[...minor, ...lucky].map((star) => (
                    <span
                      key={star.name}
                      className="text-[10px] leading-tight text-ink-2"
                    >
                      {star.name}
                    </span>
                  ))}
                  {sha.map((star) => (
                    <span
                      key={star.name}
                      className="text-[10px] leading-tight text-ink-3"
                    >
                      {star.name}
                    </span>
                  ))}
                </span>

                <span className="flex w-full shrink-0 items-baseline justify-between gap-1">
                  {palace.daXianAge ? (
                    <span
                      className={`font-mono text-[9px] tabular-nums ${
                        palace.isCurrentDaXian ? 'text-zhu' : 'text-ink-3'
                      }`}
                    >
                      {palace.daXianAge[0]}–{palace.daXianAge[1]}
                    </span>
                  ) : (
                    <span />
                  )}
                  {(palace.isMingGong || palace.isShenGong) && (
                    <span className="text-[9px] font-medium text-zhu">
                      {palace.isMingGong ? copy.mingMark : ''}
                      {palace.isShenGong ? copy.shenMark : ''}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {/* 中宫：控制区常驻 —— 时间轴 / 运限摘要 / 追问入口，不用点开。
              开盘仪式末尾盖一方朱砂印（seal 状态在组件顶层，打印恒不渲染） */}
          <div
            style={{ ...openStyle(12), gridRow: '2 / 4', gridColumn: '2 / 4' }}
            className={`relative min-h-0 overflow-hidden bg-paper p-1.5 ${revealing ? 'open-reveal' : ''}`}
          >
            {mobileCenter}
            {seal && (
              <Seal size="sm" className="seal-stamp absolute bottom-1.5 right-1.5 print:hidden" />
            )}
          </div>
        </div>

        {/* ── 移动端操作行：选中宫的三方四正 + 就此追问，常驻在盘下 ── */}
        <div
          className="flex min-h-[52px] shrink-0 items-center gap-2 border-t border-line px-2 py-1.5 print:hidden"
          aria-live="polite"
        >
          {selectedPalace ? (
            <>
              <span className="shrink-0 text-2xs font-medium text-ink">
                {palaceLabel(selectedPalace.name, lang)}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {sanFangBranches(selectedPalace.branch).map((branch) => {
                  const p = palaces.find((x) => x.branch === branch);
                  if (!p) return null;
                  const isSelf = p.branch === selectedPalace.branch;
                  return (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => toggleSelected(p.branch)}
                      aria-current={isSelf ? 'true' : undefined}
                      className={`rounded-full border px-2 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                        isSelf
                          ? 'border-zhu bg-zhu-soft text-ink'
                          : 'border-line bg-surface text-ink-2'
                      }`}
                    >
                      {palaceLabel(p.name, lang, true)}
                    </button>
                  );
                })}
              </div>
              {onAskPalace && (
                <button
                  type="button"
                  onClick={() => onAskPalace(selectedPalace.name)}
                  className="shrink-0 rounded-full border border-zhu/30 bg-surface px-2.5 py-1.5 text-2xs leading-none text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  {copy.askHere}
                </button>
              )}
            </>
          ) : (
            <p className="text-2xs text-ink-3">
              {copy.tapPalaceHint}
            </p>
          )}
        </div>
      </div>

      {/* ── 桌面端：一体网格 + 中宫 ─────────────────────────────── */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex print:flex-none print:h-auto">
        <div className="min-h-0 flex-1 overflow-x-auto print:flex-none print:overflow-visible">
          <div
            id="chart-board-grid-desktop"
            className="palace-grid grid h-full min-w-[42rem] overflow-hidden rounded-2xl print:h-auto"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            }}
            role="group"
            aria-label={copy.boardAria}
          >
            {palaces.map((palace) => {
              const [row, col] = GRID_POS[palace.branch];
              const active = selected === palace.branch;
              const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
              const layerMark = [
                layer === 'liunian' && fortune && palace.branch === fortune.mingBranch
                  ? 'is-liunian-ming'
                  : '',
                layer === 'daxian' && fortune && palace.branch === fortune.mingBranch
                  ? 'is-daxian-ming'
                  : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  key={palace.branch}
                  style={{ ...openStyle(openStep.get(palace.branch) ?? 0), gridRow: row, gridColumn: col }}
                  className={`min-h-0 overflow-y-auto print:overflow-visible ${revealing ? 'open-reveal' : ''}`}
                >
                  <PalaceCell
                    palace={palace}
                    selected={active}
                    inSanFang={inSan}
                    onSelect={() => toggleSelected(palace.branch)}
                    fortune={layer === 'natal' ? null : fortune}
                    layerMark={layerMark}
                  />
                  {active && (
                    <p className="sr-only" role="status">
                      {copy.selectedSr(palaceLabel(palace.name, lang))}
                    </p>
                  )}
                </div>
              );
            })}

            <div
              style={{ ...openStyle(12), gridRow: '2 / 4', gridColumn: '2 / 4' }}
              className={`min-h-0 overflow-y-auto print:overflow-visible ${revealing ? 'open-reveal' : ''}`}
            >
              {centerPanel}
            </div>
          </div>
        </div>

        {/* 桌面操作行：图例 + 选中宫的三方四正 / 就此追问 */}
        <div
          className="mt-1.5 flex min-h-[44px] flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-2xs text-ink-3"
          aria-live="polite"
        >
          {sihuaLegend(copy)}
          <span>{copy.siHuaLegendLabel}</span>
          <span className="h-3 w-px bg-line" />
          <span>{copy.brightnessHint}</span>
          {selectedPalace ? (
            <>
              <span className="h-3 w-px bg-line" />
              <span className="font-medium text-ink">{palaceLabel(selectedPalace.name, lang)}</span>
              {sanFangBranches(selectedPalace.branch).map((branch) => {
                const p = palaces.find((x) => x.branch === branch);
                if (!p) return null;
                const isSelf = p.branch === selectedPalace.branch;
                return (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => toggleSelected(p.branch)}
                    aria-current={isSelf ? 'true' : undefined}
                    className={`rounded-full border px-2 py-1 leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                      isSelf
                        ? 'border-zhu bg-zhu-soft text-ink'
                        : 'border-line bg-surface text-ink-2'
                    }`}
                  >
                    {palaceLabel(p.name, lang, true)}
                  </button>
                );
              })}
              {onAskPalace && (
                <button
                  type="button"
                  onClick={() => onAskPalace(selectedPalace.name)}
                  className="rounded-full border border-zhu/30 bg-surface px-2.5 py-1 leading-none text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  {copy.askHere}
                </button>
              )}
            </>
          ) : (
            <>
              <span className="h-3 w-px bg-line" />
              <span>{copy.tapPalaceHintShort}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
