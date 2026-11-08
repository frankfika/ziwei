'use client';

/**
 * 命盘页的服务端渲染骨架（摘要行 / 详情面板 / 排盘失败页）。
 *
 * chart/page.tsx 是 server component（排盘引擎在服务端跑），拿不到语言状态；
 * 这三块界面文案抽到这里，用 useLang 取语言。
 */

import Link from 'next/link';
import { useLang } from '@/lib/lang';
import { CHART_COPY } from '@/lib/chartCopy';

type Gender = 'male' | 'female';

/** 排盘失败页 */
export function ChartInvalid({
  kind,
  message,
}: {
  /** params = 入参有问题；failed = 引擎抛错（message 原样展示） */
  kind: 'params' | 'failed';
  message?: string;
}) {
  const [lang] = useLang();
  const copy = CHART_COPY[lang];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg tracking-wide text-ink">{copy.invalidTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2" role="alert">
          {kind === 'params' ? copy.invalidParams : (message ?? copy.invalidFailed)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {copy.backToInput}
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            {copy.methodologyLong}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** 摘要行：姓名 · 生辰 · 时辰 · 性别（+ 晚子时标记） */
export function ChartSummary({
  name,
  year,
  month,
  day,
  shichen,
  gender,
  lateZi = false,
}: {
  name?: string;
  year: number;
  month: number;
  day: number;
  /** 时辰序号对应的地支名（数据集术语） */
  shichen: string;
  gender: Gender;
  lateZi?: boolean;
}) {
  const [lang] = useLang();
  const copy = CHART_COPY[lang];

  return (
    <h1 className="truncate text-sm font-medium tracking-wide text-ink md:text-base">
      {name ? `${name} · ` : ''}
      {copy.summaryDate(year, month, day)} · {copy.summaryHour(shichen)} ·{' '}
      {gender === 'male' ? copy.genderMale : copy.genderFemale}
      {lateZi && (
        <span className="ml-1.5 text-zhu" title={copy.lateZiShiftTitle}>
          {copy.lateZiShift}
        </span>
      )}
    </h1>
  );
}

/** 「详情」面板：排盘日 / 时辰区间 / 真太阳时口径 / 入口链接 */
export function ChartDetails({
  year,
  month,
  day,
  shichen,
  shichenRange,
  lateZi = false,
  birthDate,
  chartDate,
}: {
  year: number;
  month: number;
  day: number;
  shichen: string;
  shichenRange: string;
  lateZi?: boolean;
  /** 用户输入的出生日期 */
  birthDate?: string;
  /** 顺延后的排盘日 */
  chartDate: string;
}) {
  const [lang] = useLang();
  const copy = CHART_COPY[lang];

  return (
    <div className="space-y-2 text-2xs leading-relaxed text-ink-2">
      <p>
        {copy.chartDateLabel}{' '}
        <span className="tabular-nums text-ink">{copy.summaryDate(year, month, day)}</span>
      </p>
      <p>{copy.summaryHourRange(shichen, shichenRange)}</p>
      <p>{copy.noSolarCorrection}</p>
      {lateZi && (
        <p className="text-zhu">
          {copy.lateZiNote(birthDate || '—', chartDate, copy.summaryHour(shichen))}
        </p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-lineSoft pt-2">
        <Link
          href="/"
          className="text-ink underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.recast}
        </Link>
        <Link
          href="/about"
          className="text-ink underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.methodology}
        </Link>
      </div>
    </div>
  );
}
