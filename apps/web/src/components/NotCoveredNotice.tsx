'use client';

import Link from 'next/link';
import { useLang } from '@/lib/lang';
import { SITE_COPY } from '@/lib/siteCopy';

/**
 * 样本库未覆盖时的提示。
 *
 * `message` 由 @ziwei/core 生成，**原样展示**，不做改写、不补写任何解读。
 */
export default function NotCoveredNotice({
  message,
  availableYears,
}: {
  message: string;
  availableYears: number[];
}) {
  const [lang] = useLang();
  const copy = SITE_COPY[lang];
  const yearSummary = (() => {
    if (!availableYears.length) return copy.notCoveredNone;
    const sorted = [...availableYears].sort((a, b) => a - b);
    if (sorted.length <= 12) return sorted.join(' / ');
    return `${sorted[0]}–${sorted[sorted.length - 1]}${copy.notCoveredRange(sorted[0], sorted[sorted.length - 1], sorted.length)}`;
  })();

  return (
    <section
      className="rounded-xl border border-zhu/25 bg-zhu-soft/50 p-6 sm:p-7"
      aria-labelledby="not-covered-title"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-zhu" aria-hidden="true" />
        <h2 id="not-covered-title" className="text-sm font-medium tracking-wide text-ink">
          {copy.notCoveredTitle}
        </h2>
      </div>

      <p
        className="mt-3 whitespace-pre-line text-[15px] leading-[1.9] text-ink-2"
        role="status"
      >
        {message}
      </p>

      <p className="mt-5 border-t border-zhu/15 pt-4 text-xs leading-relaxed text-ink-2">
        {copy.notCoveredYearsLead}{yearSummary}
      </p>

      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {copy.notCoveredBody}
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {copy.notCoveredRetry}
        </Link>
        <Link
          href="/#coverage"
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.notCoveredCoverage}
        </Link>
      </div>
    </section>
  );
}
