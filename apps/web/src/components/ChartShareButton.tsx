'use client';

import { useEffect, useRef, useState } from 'react';
import { GENDER_LABEL, SHICHEN_NAMES } from '@/lib/birth';

export interface ChartShareButtonProps {
  name?: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  chartDate: string;
}

type CopyKind = 'summary' | 'link' | null;

function buildSummary({
  name,
  year,
  month,
  day,
  hour,
  gender,
  chartDate,
}: ChartShareButtonProps): string {
  const parts = [
    name?.trim() ? name.trim() : null,
    `${year} 年 ${month} 月 ${day} 日`,
    `${SHICHEN_NAMES[hour]}时`,
    GENDER_LABEL[gender],
    `排盘日 ${chartDate}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function ChartShareButton(props: ChartShareButtonProps) {
  const [copied, setCopied] = useState<CopyKind>(null);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copyText = async (text: string, kind: Exclude<CopyKind, null>) => {
    setFailed(false);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      setFailed(true);
      setCopied(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFailed(false), 2500);
    }
  };

  const onCopySummary = () => copyText(buildSummary(props), 'summary');
  const onCopyLink = () => copyText(window.location.href, 'link');

  const liveMessage =
    copied === 'summary'
      ? '已复制摘要'
      : copied === 'link'
        ? '已复制链接'
        : failed
          ? '复制未成功，请手动选中标题复制'
          : '';

  const summaryLabel = copied === 'summary' ? '已复制摘要' : '复制生辰摘要';
  const linkLabel = copied === 'link' ? '已复制链接' : '复制本页链接';

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
      <button
        type="button"
        onClick={onCopySummary}
        aria-label={summaryLabel}
        className={`inline-flex min-h-9 items-center rounded-lg border px-3 py-2 text-2xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
          copied === 'summary'
            ? 'border-zhu/40 bg-zhu-soft text-ink'
            : 'border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
        }`}
      >
        {summaryLabel}
      </button>
      <button
        type="button"
        onClick={onCopyLink}
        aria-label={linkLabel}
        className={`inline-flex min-h-9 items-center rounded-lg border px-3 py-2 text-2xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
          copied === 'link'
            ? 'border-zhu/40 bg-zhu-soft text-ink'
            : 'border-line bg-surface text-ink-2 hover:border-ink-3 hover:text-ink'
        }`}
      >
        {linkLabel}
      </button>
      <span
        className={`inline-flex min-h-9 items-center rounded-lg px-2 text-2xs ${
          failed
            ? 'bg-zhu-soft/60 text-zhu'
            : copied
              ? 'text-ink'
              : 'text-ink-3'
        }`}
        role={failed ? 'alert' : 'status'}
        aria-live={failed ? 'assertive' : 'polite'}
      >
        {liveMessage}
      </span>
    </div>
  );
}
