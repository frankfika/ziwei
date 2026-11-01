'use client';

/**
 * 对话内嵌命盘卡 —— 回答就地渲染，不跳走。
 *
 * 迷你 4×4 方阵：主星 + 四化章，可选流年层（宫名 + 流年四化）。
 * 点宫位高亮三方四正。整卡可折叠，聊天流里不抢视觉。
 */

import { useState } from 'react';
import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import { GRID_POS, sanFangBranches, brightnessClass, SIHUA_CLASS, fortuneSiHuaOf } from './PalaceCell';
import type { ChatChartPayload } from '@/app/chat-chart-action';

interface MiniChartProps {
  chart: ChatChartPayload;
  /** 初始高亮的宫（来自追问焦点） */
  focusBranch?: number | null;
  /** 是否叠加流年层 */
  layer?: 'natal' | 'liunian';
  onLayerChange?: (layer: 'natal' | 'liunian') => void;
}

export default function MiniChart({ chart, focusBranch = null, layer = 'natal', onLayerChange }: MiniChartProps) {
  const [selected, setSelected] = useState<number | null>(focusBranch);
  const [open, setOpen] = useState(true);

  const fortune: ChartFortuneLayer | null =
    layer === 'liunian' && chart.liunian
      ? {
          kind: 'liunian',
          label: chart.liunian.label,
          mingBranch: chart.liunian.mingBranch,
          palaces: chart.liunian.palaces,
          siHua: chart.liunian.siHua,
          siHuaPalaces: {},
        }
      : null;

  const sanFang = selected === null ? null : new Set(sanFangBranches(selected));

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-2/60" data-mini-chart>
      {/* 卡头：局名 + 展开收起 + 时间层切换 */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          <span aria-hidden="true" className={`text-2xs text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="truncate text-2xs text-ink-2">
            {chart.center.wuxingJuName} · 虚岁 {chart.center.currentAge}
          </span>
        </button>
        {onLayerChange && (
          <div className="flex shrink-0 rounded-full border border-line bg-surface p-0.5">
            {(['natal', 'liunian'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onLayerChange(k)}
                aria-pressed={layer === k}
                className={`rounded-full px-2 py-0.5 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                  layer === k ? 'bg-zhu-soft text-ink' : 'text-ink-3'
                }`}
              >
                {k === 'natal' ? '本命' : '流年'}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="border-t border-lineSoft p-1.5">
          <div
            className="palace-grid grid overflow-hidden rounded-lg"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(4, minmax(0, 1fr))',
            }}
            role="group"
            aria-label="命盘缩略图"
          >
            {chart.palaces.map((palace) => (
              <MiniCell
                key={palace.branch}
                palace={palace}
                active={selected === palace.branch}
                inSan={!!sanFang && sanFang.has(palace.branch) && selected !== palace.branch}
                fortune={fortune}
                onSelect={() =>
                  setSelected((prev) => (prev === palace.branch ? null : palace.branch))
                }
              />
            ))}
            <div
              style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
              className="flex flex-col items-center justify-center gap-0.5 bg-paper p-1 text-center"
            >
              <span className="text-2xs font-semibold text-ink">{chart.center.wuxingJuName}</span>
              <span className="text-[9px] leading-tight text-ink-3">
                {chart.center.mingZhu ? `命主 ${chart.center.mingZhu}` : ''}
                {chart.center.shenZhu ? ` 身主 ${chart.center.shenZhu}` : ''}
              </span>
              {fortune && (
                <span className="text-[9px] leading-tight text-hua-ke">
                  流年命在
                  {chart.palaces.find((p) => p.branch === fortune.mingBranch)?.name ?? ''}
                </span>
              )}
            </div>
          </div>

          {/* 图例 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-ink-3">
            <span className="chip-sihua border-hua-lu/40 bg-hua-lu/10 text-hua-lu">禄</span>
            <span className="chip-sihua border-hua-quan/40 bg-hua-quan/10 text-hua-quan">权</span>
            <span className="chip-sihua border-hua-ke/40 bg-hua-ke/10 text-hua-ke">科</span>
            <span className="chip-sihua border-hua-ji/40 bg-hua-ji/10 text-hua-ji">忌</span>
            {fortune && <span>流年层：宫名带框 + 流年四化</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniCell({
  palace,
  active,
  inSan,
  fortune,
  onSelect,
}: {
  palace: ChartPalace;
  active: boolean;
  inSan: boolean;
  fortune: ChartFortuneLayer | null;
  onSelect: () => void;
}) {
  const [row, col] = GRID_POS[palace.branch];
  const major = palace.stars.filter((s) => s.type === 'major');
  const fortuneName = fortune?.palaces.find((p) => p.branch === palace.branch)?.name ?? null;

  return (
    <button
      type="button"
      style={{ gridRow: row, gridColumn: col }}
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${palace.name}，主星${major.map((s) => s.name).join('、') || '空宫'}`}
      className={`palace-cell flex min-h-[42px] flex-col items-start gap-0 overflow-hidden p-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu ${
        active ? 'is-selected' : inSan ? 'is-sanfang' : ''
      }`}
    >
      <span className="flex w-full items-baseline justify-between gap-0.5">
        <span
          className={`text-[9px] leading-tight ${
            palace.isMingGong ? 'text-zhu' : palace.isShenGong ? 'text-hua-quan' : 'text-ink-3'
          }`}
        >
          {palace.name.replace('宫', '')}
        </span>
        {fortuneName && fortuneName !== palace.name && (
          <span
            className="shrink-0 rounded-sm border border-hua-ke/40 bg-hua-ke/10 px-0.5 text-[8px] leading-none text-hua-ke"
            title={`流年${fortuneName}`}
          >
            {fortuneName.replace('宫', '')}
          </span>
        )}
      </span>
      <span className="flex w-full min-w-0 flex-col gap-px overflow-hidden">
        {major.length === 0 ? (
          <span className="text-[9px] text-ink-3">空</span>
        ) : (
          major.slice(0, 2).map((star) => {
            const mark = fortuneSiHuaOf(star.name, fortune);
            return (
              <span key={star.name} className="flex items-baseline gap-0.5 leading-tight">
                <span className={`text-[10px] font-semibold ${brightnessClass(star.brightnessRaw)}`}>
                  {star.name}
                </span>
                {star.siHua && (
                  <span className={`chip-sihua px-0.5 text-[8px] leading-none ${SIHUA_CLASS[star.siHua] ?? 'border-line text-ink-3'}`}>
                    {star.siHua}
                  </span>
                )}
                {mark && (
                  <span className={`chip-sihua px-0.5 text-[8px] leading-none ${SIHUA_CLASS[mark] ?? 'border-line text-ink-3'}`}>
                    流{mark}
                  </span>
                )}
              </span>
            );
          })
        )}
      </span>
    </button>
  );
}
