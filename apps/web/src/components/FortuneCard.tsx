'use client';

/**
 * 运限运势卡：今年（流年）与这步（大限）各一张。
 * 数据全部来自引擎（流年命宫/四化、大限命宫/四化），没有解读原文的部分不编。
 */

import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import { useLang } from '@/lib/lang';
import { CHART_COPY, palaceLabel } from '@/lib/chartCopy';

const SIHUA_ROW: Array<[keyof ChartFortuneLayer['siHua'], string, string]> = [
  ['lu', '禄', 'text-hua-lu border-hua-lu/40 bg-hua-lu/10'],
  ['quan', '权', 'text-hua-quan border-hua-quan/40 bg-hua-quan/10'],
  ['ke', '科', 'text-hua-ke border-hua-ke/40 bg-hua-ke/10'],
  ['ji', '忌', 'text-hua-ji border-hua-ji/40 bg-hua-ji/10'],
];

function SiHuaRow({ siHua }: { siHua: ChartFortuneLayer['siHua'] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SIHUA_ROW.map(([key, label, cls]) => (
        <span key={key} className={`chip-sihua px-1.5 py-1 ${cls}`}>
          {label} {siHua[key]}
        </span>
      ))}
    </div>
  );
}

/** 今年运势卡：流年命宫落在本命哪个宫 + 流年四化 */
export function LiuNianCard({
  liunian,
  palaces,
  onAsk,
}: {
  liunian: ChartFortuneLayer;
  palaces: ChartPalace[];
  /** 提供时就显示「就今年追问」按钮 */
  onAsk?: () => void;
}) {
  const [lang] = useLang();
  const copy = CHART_COPY[lang];
  const ming = palaces.find((p) => p.branch === liunian.mingBranch);
  const natalStars = ming?.majorStars ?? [];

  return (
    <section
      className="panel-ritual p-5"
      aria-label={copy.fortuneAria(liunian.label)}
      data-liunian-card={liunian.label}
    >
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-serif text-title font-semibold text-ink">
          {liunian.label}
        </h2>
        <span className="text-2xs text-ink-3">{copy.liuNian}</span>
      </header>

      <dl className="mb-3 space-y-1.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-2xs text-ink-3">{copy.annualLifePalace}</dt>
          <dd className="text-right text-ink">
            {ming ? `${palaceLabel(ming.name, lang)}（${ming.branchName}）` : '—'}
          </dd>
        </div>
        {natalStars.length > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-2xs text-ink-3">{copy.natalMajorStars}</dt>
            <dd className="text-right text-ink">{natalStars.join('、')}</dd>
          </div>
        )}
      </dl>

      <SiHuaRow siHua={liunian.siHua} />

      {onAsk && (
        <button
          type="button"
          onClick={onAsk}
          className="mt-3 inline-flex min-h-9 items-center rounded-full border border-zhu/30 bg-surface px-4 py-2 text-2xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.askThisYear} →
        </button>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">
        {copy.annualPalaceHint}
      </p>
    </section>
  );
}
