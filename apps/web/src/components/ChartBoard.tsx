'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartPalace } from '@ziwei/chart-engine';
import PalaceCell, { GRID_POS, sanFangBranches, brightnessClass, SIHUA_CLASS } from './PalaceCell';
import CenterPanel, { type ChartCenterInfo } from './CenterPanel';
import { DURATION, motionStyle } from '@/lib/motion';

interface ChartBoardProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
}

/** 四化图例（桌面一行 / 移动端 sheet 顶部共用） */
const SIHUA_LEGEND = (
  <>
    <span className="chip-sihua border-hua-lu/40 bg-hua-lu/10 text-hua-lu">禄</span>
    <span className="chip-sihua border-hua-quan/40 bg-hua-quan/10 text-hua-quan">权</span>
    <span className="chip-sihua border-hua-ke/40 bg-hua-ke/10 text-hua-ke">科</span>
    <span className="chip-sihua border-hua-ji/40 bg-hua-ji/10 text-hua-ji">忌</span>
  </>
);

export default function ChartBoard({ palaces, center }: ChartBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  /** 移动端：中宫详情 sheet */
  const [centerOpen, setCenterOpen] = useState(false);
  /** 关闭动画进行中（sheet 暂不卸载） */
  const [closing, setClosing] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  const sheetOpen = selected !== null || centerOpen;

  const closeSheet = () => {
    // 先播关闭动画，动画结束才卸载（.detail-sheet.is-closing 反向 180ms）
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      setSelected(null);
      setCenterOpen(false);
      window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
    }, DURATION.sheetClose);
  };

  // Escape 关闭 sheet；关闭后焦点回到触发宫格
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setClosing(true);
      window.setTimeout(() => {
        setClosing(false);
        setSelected(null);
        setCenterOpen(false);
        window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
      }, DURATION.sheetClose);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const toggleSelected = (branch: number) => {
    setCenterOpen(false);
    setSelected((prev) => (prev === branch ? null : branch));
  };

  const jumpChips: Array<{ key: string; label: string; palace: ChartPalace | null }> = [
    { key: 'ming', label: '命宫', palace: mingPalace },
    { key: 'shen', label: '身宫', palace: shenPalace },
    { key: 'daxian', label: '当前大限', palace: currentDaXian },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col print:flex-none print:h-auto">
      {/* ── 移动端：紧凑四四方阵 ───────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col md:hidden">
        <div
          id="chart-board-grid"
          className="palace-grid grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
          }}
          role="group"
          aria-label="十二宫命盘"
        >
          {palaces.map((palace) => {
            const [row, col] = GRID_POS[palace.branch];
            const active = selected === palace.branch;
            const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
            const major = palace.stars.filter((s) => s.type === 'major');
            // palace-breathe / sanfang-fade：class 增删才重播 keyframes，
            // 所以呼吸与淡入只在「状态刚变」时各播一次
            const stateClass = active
              ? 'is-selected palace-breathe'
              : inSan
                ? 'is-sanfang sanfang-fade'
                : '';


            return (
              <button
                key={palace.branch}
                type="button"
                style={{ gridRow: row, gridColumn: col }}
                onClick={(event) => {
                  mobileTriggerRef.current = event.currentTarget;
                  toggleSelected(palace.branch);
                }}
                aria-pressed={active}
                aria-label={[
                  palace.name,
                  `主星${major.map((s) => s.name).join('、') || '空宫'}`,
                  palace.isMingGong ? '命宫' : null,
                  palace.isShenGong ? '身宫' : null,
                  active ? '已选中' : null,
                  inSan ? '三方四正关联' : null,
                ]
                  .filter(Boolean)
                  .join('，')}
                className={`palace-cell ${stateClass} flex min-h-0 flex-col items-start gap-0.5 overflow-hidden p-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu`}
              >
                <span className="flex w-full shrink-0 items-baseline justify-between gap-1">
                  <span
                    className={`text-[10px] font-medium leading-tight ${
                      palace.isMingGong
                        ? 'text-zhu'
                        : palace.isShenGong
                          ? 'text-hua-quan'
                          : 'text-ink-2'
                    }`}
                  >
                    {palace.name}
                  </span>
                  <span className="font-mono text-[9px] leading-tight text-ink-3">
                    {palace.stemName}
                    {palace.branchName}
                  </span>
                </span>

                {/* 主星区：宫内主星多时格内滚动，不撑破盘 */}
                <span className="flex w-full min-h-0 flex-1 flex-col gap-px overflow-y-auto">
                  {major.length === 0 ? (
                    <span className="text-[10px] text-ink-3">空宫</span>
                  ) : (
                    major.map((star) => (
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
                      </span>
                    ))
                  )}
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
                      {palace.isMingGong ? '命' : ''}
                      {palace.isShenGong ? '身' : ''}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {/* 中宫：虚空 —— 局名 / 命主身主 / 虚岁 + 跳转芯片 */}
          <div
            style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
            className="flex min-h-0 flex-col items-center justify-center gap-1 bg-paper p-2"
          >
            <button
              type="button"
              onClick={(event) => {
                mobileTriggerRef.current = event.currentTarget;
                setSelected(null);
                setCenterOpen(true);
              }}
              className="flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              <span className="text-title font-semibold text-ink">
                {center.wuxingJuName}
              </span>
              {(center.mingZhu || center.shenZhu) && (
                <span className="text-2xs leading-tight text-ink-2">
                  {center.mingZhu ? `命主 ${center.mingZhu}` : ''}
                  {center.mingZhu && center.shenZhu ? ' · ' : ''}
                  {center.shenZhu ? `身主 ${center.shenZhu}` : ''}
                </span>
              )}
              <span className="text-2xs leading-tight text-ink-3">
                {center.yinYangGender ? `${center.yinYangGender} · ` : ''}虚岁{' '}
                {center.currentAge} 岁
              </span>
            </button>

            {/* 跳转芯片：挪进中宫，省掉盘下方那 40px */}
            <div className="flex w-full shrink-0 flex-wrap items-center justify-center gap-1">
              {jumpChips.map((chip) => {
                if (!chip.palace) return null;
                const active = selected === chip.palace.branch;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={(event) => {
                      mobileTriggerRef.current = event.currentTarget;
                      toggleSelected(chip.palace!.branch);
                    }}
                    className={`rounded-full border px-1.5 py-0.5 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                      active
                        ? 'border-zhu bg-zhu-soft text-ink'
                        : 'border-line bg-surface text-ink-3'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 移动端底部 sheet：盘留在背板，压暗 4% ───────────────── */}
        {sheetOpen && (
          <>
            {/* 遮罩铺满视口（盘留在背板，压暗 4%） */}
            <div
              className="fixed inset-0 z-30 bg-paper/40 print:hidden"
              onClick={closeSheet}
              aria-hidden="true"
            />
            <div
              id="mobile-palace-detail"
              role="region"
              aria-label={centerOpen ? '中宫详情' : `${selectedPalace?.name ?? ''}宫位详情`}
              className={`palace-sheet detail-sheet absolute inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto overscroll-contain print:hidden ${closing ? 'is-closing' : ''}`}
              style={motionStyle(closing ? DURATION.sheetClose : DURATION.sheet)}
            >
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-paper/95 px-3.5 py-2 backdrop-blur">
                <p className="text-xs font-medium text-ink">
                  {centerOpen ? '中宫 · 命盘详情' : `${selectedPalace?.name ?? ''} · 宫位详情`}
                </p>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="inline-flex min-h-9 items-center rounded-md px-3 py-2 text-2xs text-ink-2 transition-colors hover:bg-lineSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  收起
                </button>
              </div>

              {centerOpen ? (
                <div className="px-3.5 py-2">
                  <CenterPanel palaces={palaces} info={center} />
                </div>
              ) : (
                selectedPalace && (
                  <>
                    {/* 四化图例：从盘下挪进 sheet 顶部 */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-lineSoft px-3.5 py-2 text-2xs text-ink-3">
                      {SIHUA_LEGEND}
                      <span className="h-3 w-px bg-line" />
                      <span>庙旺为星金，陷落为浅灰</span>
                    </div>

                    <PalaceCell
                      palace={selectedPalace}
                      selected
                      inSanFang={false}
                      onSelect={closeSheet}
                      variant="sheet"
                    />

                    <div className="border-t border-line bg-paper px-3.5 py-2.5">
                      <p className="mb-1.5 text-2xs text-ink-3">三方四正</p>
                      <div className="flex flex-wrap gap-1.5" aria-label="三方四正宫位">
                        {sanFangBranches(selectedPalace.branch).map((branch) => {
                          const palace = palaces.find((p) => p.branch === branch);
                          if (!palace) return null;
                          const isSelf = palace.branch === selectedPalace.branch;
                          return (
                            <button
                              key={branch}
                              type="button"
                              onClick={() => toggleSelected(palace.branch)}
                              aria-current={isSelf ? 'true' : undefined}
                              className={`inline-flex min-h-9 items-center rounded-full border px-2.5 py-2 text-2xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                                isSelf
                                  ? 'border-zhu bg-zhu-soft text-ink'
                                  : 'border-line bg-surface text-ink-2'
                              }`}
                            >
                              {palace.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 桌面端：一体网格 + 中宫 ─────────────────────────────── */}
      <div className="hidden min-h-0 flex-1 flex-col md:flex print:flex-none print:h-auto">
        <div className="min-h-0 flex-1 overflow-x-auto print:flex-none print:overflow-visible">
          <div
            id="chart-board-grid-desktop"
            className="palace-grid grid h-full min-w-[46rem] overflow-hidden print:h-auto"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            }}
            role="group"
            aria-label="十二宫命盘"
          >
            {palaces.map((palace) => {
              const [row, col] = GRID_POS[palace.branch];
              const active = selected === palace.branch;
              const inSan = !!sanFang && sanFang.has(palace.branch) && !active;

              return (
                <div
                  key={palace.branch}
                  style={{ gridRow: row, gridColumn: col }}
                  className="min-h-0 overflow-y-auto print:overflow-visible"
                >
                  <PalaceCell
                    palace={palace}
                    selected={active}
                    inSanFang={inSan}
                    onSelect={() => toggleSelected(palace.branch)}
                  />
                  {active && (
                    <p className="sr-only" role="status">
                      已选择{palace.name}，并高亮其三方四正
                    </p>
                  )}
                </div>
              );
            })}

            <div
              style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
              className="min-h-0 overflow-y-auto print:overflow-visible"
            >
              <CenterPanel palaces={palaces} info={center} />
            </div>
          </div>
        </div>

        {/* 桌面图例：一行 */}
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-2xs text-ink-3" aria-live="polite">
          {SIHUA_LEGEND}
          <span>四化</span>
          <span className="h-3 w-px bg-line" />
          <span>庙旺为星金，陷落为浅灰</span>
          <span className="h-3 w-px bg-line" />
          <p className="text-center text-2xs text-ink-3">
            {selectedPalace
              ? `已选择${selectedPalace.name}，高亮宫位为三方四正。`
              : '点击宫位可查看三方四正。'}
          </p>
          {selectedPalace ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="取消宫位选择"
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              取消选择
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
