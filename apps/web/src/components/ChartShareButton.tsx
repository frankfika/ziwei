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
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onCopy = async () => {
    const text = buildSummary(props);
    setFailed(false);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
      setCopied(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFailed(false), 2500);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onCopy}
        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
      >
        复制生辰摘要
      </button>
      <span className="min-h-4 text-2xs text-ink-3" aria-live="polite">
        {copied ? '已复制' : failed ? '复制未成功，请手动选中标题复制' : ''}
      </span>
    </div>
  );
}
