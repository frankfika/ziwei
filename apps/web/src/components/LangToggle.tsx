'use client';

/**
 * 语言切换（中 / EN）—— 只影响额度相关文案（站点其余部分仍是中文）。
 */

import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';

export default function LangToggle({ className = '' }: { className?: string }) {
  const [lang, setLang] = useLang();
  const copy = QUOTA_COPY[lang];
  const next = lang === 'zh' ? 'en' : 'zh';

  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={copy.langToggle}
      aria-label={copy.langToggle}
      data-lang-toggle=""
      className={`inline-flex min-h-7 items-center rounded-full border border-line bg-surface px-2 py-0.5 text-2xs leading-none text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${className}`}
    >
      {copy.langToggle}
    </button>
  );
}
