import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '页面不存在',
};

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="panel mx-auto max-w-lg border-zhu/25 p-6 sm:p-8">
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">404</p>
        <h1 className="text-xl font-semibold tracking-[0.12em] text-ink">
          页面不存在
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          没有找到你访问的页面。可能是链接写错了，或内容已移除。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-4 py-2.5 text-sm font-medium tracking-wide2 text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            回首页排盘
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            关于与口径
          </Link>
        </div>
      </div>
    </div>
  );
}
