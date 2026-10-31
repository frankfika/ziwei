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
      className="mt-5 rounded-lg border border-zhu/25 bg-zhu-soft/50 px-4 py-3 text-sm text-ink-2"
      role="alert"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
