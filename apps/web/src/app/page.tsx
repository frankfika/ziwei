import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
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
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-[0.12em] text-ink sm:text-4xl">
          排一张紫微命盘
        </h1>
        <p className="mt-4 text-[15px] leading-[1.9] text-ink-2">
          输入公历出生日期与时辰，得到十二宫命盘与十三维解读。
          盘面由确定性排盘引擎算出，解读正文逐条检索自开源解读数据集 —— 不做推算，也不做补写。
        </p>
        {errorText && (
          <p className="mt-5 rounded-lg border border-zhu/25 bg-zhu-soft/50 px-4 py-3 text-sm text-ink-2">
            {errorText}
          </p>
        )}
      </section>

      <BirthForm indexedYears={years} />

      {/* 覆盖情况 */}
      <section className="mt-10 rounded-xl border border-lineSoft bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-2">
          <span className="tracking-wide2 text-ink-3">当前样本库</span>
          <span>
            已建索引年份：
            <span className="tabular-nums text-ink">
              {years.length === 0
                ? '（无）'
                : years.length <= 12
                  ? years.join(' / ')
                  : `${years[0]}–${years[years.length - 1]}（共 ${years.length} 年）`}
            </span>
          </span>
          <span>
            记录数：
            <span className="tabular-nums text-ink">
              {coverage.totalRecords.toLocaleString('zh-CN')}
            </span>
          </span>
          <span>
            维度：
            <span className="tabular-nums text-ink">13 维</span>
          </span>
        </div>
        <p className="mt-2 text-2xs leading-relaxed text-ink-3">
          未建索引的年份会如实提示「样本库未覆盖」，不会用生成内容替代。
          口径细节见{' '}
          <Link href="/about" className="text-zhu underline underline-offset-2">
            关于与口径
          </Link>
          。
        </p>
      </section>
    </div>
  );
}
