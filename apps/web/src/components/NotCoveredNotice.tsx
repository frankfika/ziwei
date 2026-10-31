import Link from 'next/link';

/**
 * 样本库未覆盖时的提示。
 *
 * `message` 由 @ziwei/core 生成，**原样展示**，不做改写、不补写任何解读。
 */
export default function NotCoveredNotice({
  message,
  availableYears,
  lookupKey,
}: {
  message: string;
  availableYears: number[];
  lookupKey: string;
}) {
  const yearSummary = (() => {
    if (!availableYears.length) return '（无）';
    const sorted = [...availableYears].sort((a, b) => a - b);
    if (sorted.length <= 12) return sorted.join(' / ');
    return `${sorted[0]}–${sorted[sorted.length - 1]}（共 ${sorted.length} 年）`;
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
          样本库未覆盖该生辰
        </h2>
      </div>

      <p
        className="mt-3 whitespace-pre-line text-[15px] leading-[1.9] text-ink-2"
        role="status"
      >
        {message}
      </p>

      <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-zhu/15 pt-4 text-xs sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-3">检索键</dt>
          <dd className="min-w-0 break-all font-mono text-ink-2">{lookupKey}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-ink-3">已建索引年份</dt>
          <dd className="min-w-0 text-ink-2">{yearSummary}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        本工具不会用模型生成的内容填补空白：命盘由确定性引擎排出，解读只来自已建索引的数据集原文。
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#8d3324] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          换一个已覆盖的年份重试
        </Link>
        <Link
          href="/#coverage"
          className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          查看覆盖年份
        </Link>
      </div>
    </section>
  );
}
