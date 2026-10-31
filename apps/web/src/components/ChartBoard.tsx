'use client';

import { useMemo, useState } from 'react';
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

  const sanFang = selected === null ? null : new Set(sanFangBranches(selected));
  const selectedPalace = useMemo(
    () => (selected === null ? null : palaces.find((p) => p.branch === selected) ?? null),
    [palaces, selected],
  );

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
              return (
                <div
                  key={palace.branch}
                  style={{ gridRow: row, gridColumn: col }}
                  className="bg-surface"
                >
                  <PalaceCell
                    palace={palace}
                    selected={selected === palace.branch}
                    inSanFang={!!sanFang && sanFang.has(palace.branch) && selected !== palace.branch}
                    onSelect={(branch) =>
                      setSelected((prev) => (prev === branch ? null : branch))
                    }
                  />
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
      </div>

      {/* 手机：中宫摘要 + 十二宫列表，避免强制横滑 */}
      <div className="md:hidden">
        <div className="mb-4 overflow-hidden rounded-xl border border-line bg-surface">
          <CenterPanel palaces={palaces} info={center} />
        </div>

        <ul className="space-y-2" aria-label="十二宫列表">
          {palaces.map((palace) => {
            const active = selected === palace.branch;
            const inSan = !!sanFang && sanFang.has(palace.branch) && !active;
            return (
              <li key={palace.branch}>
                <button
                  type="button"
                  onClick={() =>
                    setSelected((prev) => (prev === palace.branch ? null : palace.branch))
                  }
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
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

        {selectedPalace && (
          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
            <PalaceCell
              palace={selectedPalace}
              selected
              inSanFang={false}
              onSelect={() => setSelected(null)}
            />
          </div>
        )}

        <p className="mt-2 text-center text-2xs text-ink-3">
          点选宫位可展开详情；高亮为三方四正
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
