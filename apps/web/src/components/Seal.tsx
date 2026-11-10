'use client';

/**
 * 朱砂钤印：古籍落款。中文「紫微」竖排两字，英文 ZW（半透明，不露中文）。
 * 斜 3° 像随手盖下去的。首页 hero / 中宫开盘 / 各页标题共用这一个组件。
 */

import { useLang } from '@/lib/lang';

export default function Seal({
  className = '',
  size = 'md',
}: {
  className?: string;
  /** md = 40px（页面标题旁），sm = 36px（中宫），lg = 48px */
  size?: 'sm' | 'md' | 'lg';
}) {
  const [lang] = useLang();
  const dim = { sm: 'h-9 w-9 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' }[size];
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex rotate-3 flex-col items-center justify-center rounded-[3px] bg-hua-ji font-serif leading-tight text-surface shadow-[0_2px_8px_rgba(193,64,47,0.35)] ${dim} ${lang === 'zh' ? '' : 'opacity-70'} ${className}`}
    >
      {lang === 'zh' ? (
        <>
          <span>紫</span>
          <span>微</span>
        </>
      ) : (
        <span className="text-xs tracking-[0.05em]">ZW</span>
      )}
    </span>
  );
}
