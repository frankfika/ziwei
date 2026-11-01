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
      {/* 极简：一行标题，剩下的全是对话 */}
      <h1 className="mb-6 text-sm tracking-[0.3em] text-ink-3">
        和你的命盘聊聊
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </h1>

      {/* 对话主壳：选人 → 对话线程 + 意图芯片 */}
      <HomeChat providerConfigured={provider.ok} />

      <p className="mt-4 text-2xs text-ink-3">
        <Link href="/synastry" className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu">
          双人合盘 →
        </Link>
      </p>

      {/* 新建档案：手动排盘收在折叠里，首页主角是对话 */}
      <details id="new-profile" className="group mt-10 scroll-mt-6 border-t border-lineSoft pt-4">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          <h2 className="flex items-center justify-between gap-3 text-xs font-medium tracking-wide2 text-ink-3">
            <span>＋ 新建档案</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-180">
              ▾
            </span>
          </h2>
        </summary>
        <div className="mt-4">
          <BirthForm indexedYears={years} />
        </div>
      </details>

</div>
  );
}
