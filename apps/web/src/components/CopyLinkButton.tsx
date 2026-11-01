'use client';

/** 复制当前页链接（报告/盘页分享用） */
import { useState } from 'react';

export default function CopyLinkButton({ path, label = '复制链接' }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用忽略 */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
    >
      {copied ? '已复制' : label}
    </button>
  );
}
