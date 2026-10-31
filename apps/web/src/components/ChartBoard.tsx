'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartPalace } from '@ziwei/chart-engine';
import PalaceCell, { GRID_POS, sanFangBranches } from './PalaceCell';
import CenterPanel, { type ChartCenterInfo } from './CenterPanel';

interface ChartBoardProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
}

function majorStarsLine(palace: ChartPalace): string {
  if (palace.majorStars.length === 0) return '（无主星）';
  return palace.majorStars.join('、');
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

  useEffect(() => {
    if (selectedPalace && window.matchMedia('(max-width: 767px)').matches) {
      mobileDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedPalace]);

  const toggleSelected = (branch: number) => {
    setSelected((prev) => (prev === branch ? null : branch));
  };

  const closeMobileDetail = () => {
    setSelected(null);
    window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
  };

  return (
    <div>
      {/* 桌面：传统 4×4 盘 */}
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
        <p className="mt-2 text-center text-2xs text-ink-3" aria-live="polite">
          {selectedPalace
            ? `已选择${selectedPalace.name}，高亮宫位为三方四正；再次点击可取消。`
            : '点击宫位可查看三方四正。'}
        </p>
      </div>

      {/* 手机：中宫摘要 + 十二宫列表，避免强制横滑 */}
      <div className="md:hidden">
        <div className="mb-4 overflow-hidden rounded-xl border border-line bg-surface">
          <CenterPanel palaces={palaces} info={center} />
        </div>

        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">十二宫</h2>
          <p className="text-2xs text-ink-3" aria-live="polite">
            {selectedPalace ? `已选 ${selectedPalace.name}` : '点选查看详情'}
          </p>
        </div>

        {selectedPalace && (
          <div
            ref={mobileDetailRef}
            id="mobile-palace-detail"
            className="mb-3 scroll-mt-16 overflow-hidden rounded-xl border border-zhu/30 bg-surface shadow-[0_8px_24px_rgba(36,33,29,0.08)]"
            aria-label={`${selectedPalace.name}宫位详情`}
          >
            <div className="flex items-center justify-between border-b border-line bg-paper px-3.5 py-2">
              <p className="text-xs font-medium text-ink">{selectedPalace.name} · 宫位详情</p>
              <button
                type="button"
                onClick={closeMobileDetail}
                className="rounded-md px-2 py-1 text-2xs text-ink-2 transition-colors hover:bg-lineSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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
          </div>
        )}

        <ul className="space-y-2" aria-label="十二宫列表">
          {palaces.map((palace) => {
            const active = selected === palace.branch;
            const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
            const relation = active
              ? '当前已选'
              : inSan
                ? '三方四正关联宫位'
                : '';

            return (
              <li key={palace.branch}>
                <button
                  ref={active ? mobileTriggerRef : undefined}
                  type="button"
                  aria-pressed={active}
                  aria-expanded={active}
                  aria-label={`${palace.name}${relation ? `，${relation}` : ''}`}
                  onClick={() => toggleSelected(palace.branch)}
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                    active
                      ? 'border-zhu bg-zhu-soft/60'
                      : inSan
                        ? 'border-zhu/20 bg-zhu-soft/20'
                        : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {palace.name}
                      {palace.isShenGong ? (
                        <span className="ml-1 text-2xs font-normal text-zhu">身</span>
                      ) : null}
                      {active ? (
                        <span className="ml-1 text-2xs font-normal text-zhu">已选</span>
                      ) : null}
                      {inSan ? (
                        <span className="ml-1 text-2xs font-normal text-zhu">三方四正</span>
                      ) : null}
                    </span>
                    <span className="text-2xs tabular-nums text-ink-3">
                      {palace.stemName}
                      {' · '}
                      {palace.branchName}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-2">
                    {majorStarsLine(palace)}
                  </p>
                  {palace.daXianAge && (
                    <p className="mt-0.5 text-2xs text-ink-3">
                      大限 {palace.daXianAge[0]}–{palace.daXianAge[1]}
                      {palace.isCurrentDaXian ? ' · 当前' : ''}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

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
