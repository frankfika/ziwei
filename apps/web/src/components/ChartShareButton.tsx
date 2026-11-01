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

/** 摘要行里的小折叠触发器（盘页「详情」「分享」共用一套形态） */
export const SUMMARY_CHIP_CLASS =
  'inline-flex min-h-8 cursor-pointer list-none items-center rounded-full border border-line px-2.5 py-1 text-2xs text-ink-2 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu [&::-webkit-details-marker]:hidden';

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

  // 选完就收起菜单，别让它一直挂在摘要行下面
  const collapse = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.closest('details')?.removeAttribute('open');
  };

  const actionClass =
    'flex w-full min-h-9 items-center rounded-lg border border-transparent px-2.5 py-1.5 text-left text-2xs text-ink-2 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

  return (
    <details className="relative shrink-0 print:hidden">
      <summary className={SUMMARY_CHIP_CLASS}>分享</summary>
      <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-line bg-surface-2 p-1.5 shadow-[0_12px_40px_rgba(46,42,35,0.14)]">
        <button type="button" onClick={(e) => { onCopySummary(); collapse(e); }} className={actionClass}>
          {summaryLabel}
        </button>
        <button type="button" onClick={(e) => { onCopyLink(); collapse(e); }} className={actionClass}>
          {linkLabel}
        </button>
        <span
          className={`block px-2.5 py-1 text-2xs ${
            failed ? 'text-danger' : copied ? 'text-ink' : 'text-ink-3'
          }`}
          role={failed ? 'alert' : 'status'}
          aria-live={failed ? 'assertive' : 'polite'}
        >
          {liveMessage}
        </span>
      </div>
    </details>
  );
}
