import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import ErrorAlert from '@/components/ErrorAlert';
import HomeChat from '@/components/HomeChat';
import { getService } from '@/lib/service';
import { describeProviderEnv } from '@ziwei/ask';

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
  const provider = describeProviderEnv();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      {/* Hero：对话优先 */}
      <section className="mb-8 max-w-2xl sm:mb-10">
        <p className="mb-3 text-2xs tracking-[0.35em] text-ink-3">ZIWEI DOU SHU</p>
        <h1 className="font-serif text-display font-semibold text-ink">和你的命盘聊聊</h1>
        <p className="mt-3 text-[15px] leading-[1.9] text-ink-2">
          选一个档案，围绕这张盘问任何事——感情、事业、财运。回答只依据数据集原文，没写到的直说不编。
        </p>
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </section>

      {/* 对话主壳：选人 → 对话线程 + 意图芯片 */}
      <HomeChat providerConfigured={provider.ok} />

      {/* 新建档案：手动排盘收在折叠里，首页主角是对话 */}
      <details id="new-profile" className="group mt-10 scroll-mt-6 border-t border-lineSoft pt-4">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2 className="flex items-center justify-between gap-3 text-xs font-medium tracking-wide2 text-ink-3">
            <span>新建档案 · 手动排盘</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </h2>
        </summary>
        <div className="mt-4">
          <BirthForm indexedYears={years} />
        </div>
      </details>

      {/* 覆盖情况 —— 折叠，summary 只留一行标题 + 当前年份范围 */}
      <details
        id="coverage"
        className="group mt-10 scroll-mt-6 border-t border-lineSoft pt-4"
      >
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2
            id="coverage-title"
            className="flex items-center justify-between gap-3 text-xs font-medium tracking-wide2 text-ink-3"
          >
            <span>解读覆盖范围</span>
            <span className="flex items-center gap-2 tabular-nums text-ink-2">
              {years.length === 0 ? '待补充' : `${years[0]}–${years[years.length - 1]}`}
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </h2>
        </summary>

        <div className="mt-3">
          {years.length === 0 ? (
            <>
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
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-ink-2">
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
        </div>
      </details>
    </div>
  );
}
