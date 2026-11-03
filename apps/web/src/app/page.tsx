import ErrorAlert from '@/components/ErrorAlert';
import HomeChat from '@/components/HomeChat';
import { describeProviderEnv, readProviderEnv } from '@ziwei/ask';

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

  const provider = describeProviderEnv();
  const serverModel = provider.ok ? readProviderEnv().model : undefined;

  return (
    // 聊天壳占满剩余高度：用 flex 链算高度，不做 100dvh 减法 ——
    // 减法一旦算不出来（老浏览器不认 env()），整条 flex 链会塌成一条缝。
    <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-5 pb-4 pt-5 sm:px-8 sm:pb-5 sm:pt-7">
      {/* 极简：一行标题，剩下的全是对话 */}
      <h1 className="mb-4 font-serif text-[1.45rem] leading-snug text-ink sm:text-[1.6rem]">
        和你的命盘聊聊
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </h1>

      {/* 对话主壳：选人 → 对话线程 + 意图芯片 */}
      <HomeChat providerConfigured={provider.ok} serverModel={serverModel} />
    </div>
  );
}
