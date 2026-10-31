'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartPalace } from '@ziwei/chart-engine';
import PalaceCell, { GRID_POS, sanFangBranches, brightnessClass, SIHUA_CLASS } from './PalaceCell';
import CenterPanel, { type ChartCenterInfo } from './CenterPanel';
import { preferredScrollBehavior } from '@/lib/motion';

interface ChartBoardProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
}

export default function ChartBoard({ palaces, center }: ChartBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const mobileDetailRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (selectedPalace && window.matchMedia('(max-width: 767px)').matches) {
      mobileDetailRef.current?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'start',
      });
    }
  }, [selectedPalace]);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSelected(null);
      if (window.matchMedia('(max-width: 767px)').matches) {
        window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const toggleSelected = (branch: number) => {
    setSelected((prev) => (prev === branch ? null : branch));
  };

  const closeMobileDetail = () => {
    setSelected(null);
    window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
  };

  const jumpChips: Array<{ key: string; label: string; palace: ChartPalace | null }> = [
    { key: 'ming', label: '命宫', palace: mingPalace },
    { key: 'shen', label: '身宫', palace: shenPalace },
    { key: 'daxian', label: '当前大限', palace: currentDaXian },
  ];

  return (
    <div>
      <div className="hidden md:block">
        <div className="overflow-x-auto pb-1">
          <div
            className="grid min-w-[46rem] gap-px rounded-xl border border-line bg-line"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(4, minmax(10.5rem, auto))',
            }}
          >
            {palaces.map((palace) => {
              const [row, col] = GRID_POS[palace.branch];
              const active = selected === palace.branch;
              const inSan = !!sanFang && sanFang.has(palace.branch) && !active;

              return (
                <div
                  key={palace.branch}
                  style={{ gridRow: row, gridColumn: col }}
                  className="bg-surface"
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
              className="bg-surface"
            >
              <CenterPanel palaces={palaces} info={center} />
            </div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2" aria-live="polite">
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

      <div className="md:hidden">
        {/* 紧凑四四方阵 —— 手机上的「盘」本体 */}
        <div
          className="mb-3 grid gap-px overflow-hidden rounded-xl border border-line bg-line"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(4, minmax(5.25rem, auto))',
          }}
          role="group"
          aria-label="十二宫命盘"
        >
          {palaces.map((palace) => {
            const [row, col] = GRID_POS[palace.branch];
            const active = selected === palace.branch;
            const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
            const major = palace.stars.filter((s) => s.type === 'major');

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
                className={`flex min-h-[5.25rem] flex-col items-start gap-0.5 p-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu ${
                  active
                    ? 'bg-zhu-soft/70 ring-1 ring-inset ring-zhu/40'
                    : inSan
                      ? 'bg-zhu-soft/25'
                      : 'bg-surface'
                }`}
              >
                <span className="flex w-full items-baseline justify-between gap-1">
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
                <span className="flex w-full flex-1 flex-col justify-center gap-px">
                  {major.length === 0 ? (
                    <span className="text-[10px] text-ink-3">空宫</span>
                  ) : (
                    major.map((star) => (
                      <span
                        key={star.name}
                        className="flex items-baseline gap-0.5 leading-tight"
                      >
                        <span
                          className={`text-[13px] font-semibold ${brightnessClass(star.brightnessRaw)}`}
                        >
                          {star.name}
                        </span>
                        {star.siHua && (
                          <span
                            className={`rounded border px-0.5 text-[9px] leading-tight ${SIHUA_CLASS[star.siHua] ?? 'border-line text-ink-3'}`}
                          >
                            {star.siHua}
                          </span>
                        )}
                      </span>
                    ))
                  )}
                </span>
                <span className="flex w-full items-baseline justify-between gap-1">
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

          {/* 中宫：局数 / 命主身主 / 虚岁 */}
          <div
            style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
            className="flex flex-col items-center justify-center gap-1 bg-surface p-2 text-center"
          >
            <span className="font-serif text-xs font-medium tracking-[0.2em] text-ink">
              {center.wuxingJuName}
            </span>
            {(center.mingZhu || center.shenZhu) && (
              <span className="text-[10px] leading-tight text-ink-2">
                {center.mingZhu ? `命主 ${center.mingZhu}` : ''}
                {center.mingZhu && center.shenZhu ? ' · ' : ''}
                {center.shenZhu ? `身主 ${center.shenZhu}` : ''}
              </span>
            )}
            <span className="text-[10px] leading-tight text-ink-3">
              {center.yinYangGender ? `${center.yinYangGender} · ` : ''}虚岁 {center.currentAge} 岁
            </span>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" aria-label="重点宫位">
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
                className={`inline-flex min-h-9 items-center rounded-full border px-3 py-2 text-2xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                  active
                    ? 'border-zhu bg-zhu-soft text-ink'
                    : 'border-line bg-surface text-ink-2'
                }`}
              >
                {chip.label}
                <span className="ml-1 text-ink-3">
                  {chip.palace.stemName}·{chip.palace.branchName}
                </span>
              </button>
            );
          })}
        </div>

        {selectedPalace && (
          <div
            ref={mobileDetailRef}
            id="mobile-palace-detail"
            className="mb-3 max-h-[min(70vh,36rem)] scroll-mt-16 overflow-y-auto overscroll-contain rounded-xl border border-zhu/30 bg-surface shadow-[0_8px_24px_rgba(36,33,29,0.08)]"
            role="region"
            aria-label={`${selectedPalace.name}宫位详情`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeMobileDetail();
              }
            }}
          >
            <div className="flex items-center justify-between border-b border-line bg-paper px-3.5 py-2">
              <p className="text-xs font-medium text-ink">{selectedPalace.name} · 宫位详情</p>
              <button
                type="button"
                onClick={closeMobileDetail}
                className="inline-flex min-h-9 items-center rounded-md px-3 py-2 text-2xs text-ink-2 transition-colors hover:bg-lineSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                收起详情
              </button>
            </div>
            <PalaceCell
              palace={selectedPalace}
              selected
              inSanFang={false}
              onSelect={closeMobileDetail}
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
          </div>
        )}

        {/* 中宫详细信息 */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <CenterPanel palaces={palaces} info={center} />
        </div>

        <p className="mt-3 text-center text-2xs leading-relaxed text-ink-3">
          点选宫位展开详情；浅色高亮为三方四正
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-2xs text-ink-3">
        <span className="chip border-hua-lu/30 bg-hua-lu/10 text-hua-lu">禄</span>
        <span className="chip border-hua-quan/30 bg-hua-quan/10 text-hua-quan">权</span>
        <span className="chip border-hua-ke/30 bg-hua-ke/10 text-hua-ke">科</span>
        <span className="chip border-hua-ji/30 bg-hua-ji/10 text-hua-ji">忌</span>
        <span className="text-ink-3">四化</span>
        <span className="h-3 w-px bg-line" />
        <span>庙旺为暖色，陷落为浅色</span>
        <span className="h-3 w-px bg-line hidden md:inline" />
        <span className="hidden md:inline">点击宫位可查看三方四正</span>
      </div>
    </div>
  );
}
