import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import ErrorAlert from '@/components/ErrorAlert';
import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

const ERROR_TEXT: Record<string, string> = {
  year: '出生年份需在 1900–2100 之间。',
  month: '出生月份需在 1–12 之间。',
  day: '出生日期需在 1–31 之间。',
  date: '这个日期不存在，请检查年月日。',
  clock: '钟点需在 00:00–23:59 之间。',
  shichen: '时辰序号需在 0–11 之间。',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const errorKey = typeof sp.error === 'string' ? sp.error : '';
  const errorText = ERROR_TEXT[errorKey];

  const coverage = getService().coverage();
  const years = coverage.indexedYears;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      {/* Hero */}
      <section className="mb-12 max-w-2xl">
        <p className="mb-3 text-2xs tracking-[0.35em] text-ink-3">ZIWEI DOU SHU</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-[0.12em] text-ink sm:text-4xl">
          排一张紫微命盘
        </h1>
        <p className="mt-4 text-[15px] leading-[1.9] text-ink-2">
          输入公历出生日期和时辰，排出你的紫微命盘，并从性格、感情、事业等十三个方面解读。
          解读逐条有据可依；没有依据的地方宁可直说，也不编造。
        </p>
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </section>

      <BirthForm indexedYears={years} />

      {/* 覆盖情况 */}
      <section
        id="coverage"
        className="mt-10 scroll-mt-6 rounded-xl border border-lineSoft bg-surface px-5 py-4"
        aria-labelledby="coverage-title"
      >
        <h2 id="coverage-title" className="text-xs font-medium tracking-wide2 text-ink-3">
          解读覆盖范围
        </h2>
        {years.length === 0 ? (
          <div
            className="mt-3 rounded-lg border border-dashed border-line bg-paper px-3.5 py-3"
            role="status"
          >
            <p className="text-xs leading-relaxed text-ink-2">
              解读材料还在准备中。仍可排盘查看十二宫，解读会提示暂未覆盖。
            </p>
            <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">
              准备好后，这里会列出可解读的年份范围。细节见{' '}
              <Link
                href="/about"
                className="text-zhu underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                关于与口径
              </Link>
              。
            </p>
          </div>
        ) : (
          <>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              目前覆盖{' '}
              <span className="tabular-nums text-ink">
                {years[0]}–{years[years.length - 1]}
              </span>{' '}
              年出生的解读。不在范围内的生辰会如实提示，不会用编造的内容替代。
            </p>
            <p className="mt-2 text-2xs leading-relaxed text-ink-3">
              细节见{' '}
              <Link
                href="/about"
                className="text-zhu underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                关于与口径
              </Link>
              。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
