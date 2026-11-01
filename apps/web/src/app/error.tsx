'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

/**
 * App Router segment error boundary.
 * Next 16 exposes both `reset` (clear only) and `retry` (refresh + clear);
 * 「重试」 uses `retry` per Next 16 docs.
 */
export default function Error({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <div
        ref={panelRef}
        className="panel mx-auto max-w-lg border-zhu/25 p-6 sm:p-8"
        role="alert"
        tabIndex={-1}
      >
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">ERROR</p>
        <h1 className="text-xl font-semibold tracking-[0.12em] text-ink">
          出了点问题
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          页面加载或渲染时遇到意外错误。可以重试，或先回到首页重新排盘。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-4 py-2.5 text-sm font-medium tracking-wide2 text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            重试
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            回首页
          </Link>
          <Link
            href="/about"
            className="text-sm text-zhu underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            关于与口径
          </Link>
        </div>
      </div>
    </div>
  );
}
