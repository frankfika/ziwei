'use client';

import { useEffect, useRef } from 'react';

/** Autofocuses an alert when the home page shows a query-string error. */
export default function ErrorAlert({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      className="mt-5 rounded-lg border border-zhu/25 bg-zhu-soft/50 px-4 py-3.5"
      role="alert"
      tabIndex={-1}
    >
      <p className="text-xs font-medium tracking-wide text-danger">无法完成排盘</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{children}</p>
      <p className="mt-2 text-2xs leading-relaxed text-ink-3">
        请核对下方表单中的出生日期与时辰后重试。
      </p>
    </div>
  );
}
