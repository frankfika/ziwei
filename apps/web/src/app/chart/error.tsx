'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Chart-route error boundary — same warm UI as root error.tsx. */
export default function ChartError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <div
        className="panel mx-auto max-w-lg border-zhu/25 p-6 sm:p-8"
        role="alert"
      >
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">CHART</p>
        <h1 className="font-serif text-xl font-semibold tracking-[0.12em] text-ink">
          命盘页出了点问题
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          这张盘暂时无法展示。可以重试，或回到首页重新填写生辰。
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-lg bg-zhu px-4 py-2.5 text-sm font-medium tracking-wide2 text-white transition-colors hover:bg-[#8d3324] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            重试
          </button>
          <Link
            href="/"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
