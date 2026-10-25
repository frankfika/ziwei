'use client';

import { useState } from 'react';
import type { ChartPalace } from '@ziwei/chart-engine';
import PalaceCell, { GRID_POS, sanFangBranches } from './PalaceCell';
import CenterPanel, { type ChartCenterInfo } from './CenterPanel';

interface ChartBoardProps {
  palaces: ChartPalace[];
  center: ChartCenterInfo;
}

export default function ChartBoard({ palaces, center }: ChartBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);

  const sanFang = selected === null ? null : new Set(sanFangBranches(selected));

  return (
    <div>
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

      <p className="mt-2 text-center text-2xs text-ink-3 md:hidden">
        ← 左右滑动可查看完整盘面 →
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-2xs text-ink-3">
        <span className="chip border-hua-lu/30 bg-hua-lu/10 text-hua-lu">禄</span>
        <span className="chip border-hua-quan/30 bg-hua-quan/10 text-hua-quan">权</span>
        <span className="chip border-hua-ke/30 bg-hua-ke/10 text-hua-ke">科</span>
        <span className="chip border-hua-ji/30 bg-hua-ji/10 text-hua-ji">忌</span>
        <span className="text-ink-3">四化</span>
        <span className="h-3 w-px bg-line" />
        <span>庙旺为暖色，陷落为浅色</span>
        <span className="h-3 w-px bg-line" />
        <span>点击宫位可查看三方四正</span>
      </div>
    </div>
  );
}
