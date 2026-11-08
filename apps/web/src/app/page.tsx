import { cookies } from 'next/headers';
import ErrorAlert from '@/components/ErrorAlert';
import HomeChat from '@/components/HomeChat';
import { describeProviderEnv, readProviderEnv } from '@ziwei/ask';
import { langFromCookie } from '@/lib/langServer';
import { CHAT_COPY } from '@/lib/chatCopy';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const errorKey = typeof sp.error === 'string' ? sp.error : '';
  // 语言来自 cookie（切语言时写入）：首页标题与错误提示跟着语言走
  const jar = await cookies();
  const copy = CHAT_COPY[langFromCookie(jar.get('ziwei_lang')?.value)];
  const errorText =
    errorKey === 'year'
      ? copy.errorYear
      : errorKey === 'month'
        ? copy.errorMonth
        : errorKey === 'day'
          ? copy.errorDay
          : errorKey === 'date'
            ? copy.errorDate
            : errorKey === 'clock'
              ? copy.errorClock
              : errorKey === 'shichen'
                ? copy.errorShichen
                : '';

  const provider = describeProviderEnv();
  const serverModel = provider.ok ? readProviderEnv().model : undefined;

  return (
    // 聊天壳占满剩余高度：用 flex 链算高度，不做 100dvh 减法 ——
    // 减法一旦算不出来（老浏览器不认 env()），整条 flex 链会塌成一条缝。
    <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-1 flex-col px-5 pb-3 pt-3 sm:px-8 sm:pb-5 sm:pt-7">
      {/* 极简：一行标题，剩下的全是对话。手机端标题收进读屏 —— 对话本身就是这个页面 */}
      <h1 className="sr-only mb-4 font-serif text-[1.45rem] leading-snug text-ink sm:not-sr-only sm:block sm:text-[1.6rem]">
        {copy.homeTitle}
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </h1>

      {/* 对话主壳：选人 → 对话线程 + 意图芯片 */}
      <HomeChat providerConfigured={provider.ok} serverModel={serverModel} />
    </div>
  );
}
