import Link from 'next/link';
import NavLinks from './NavLinks';

/** 紫微星标：四角星，取「四方定位」之意 */
function ZiweiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2c.8 5.5 4.5 9.2 10 10-5.5.8-9.2 4.5-10 10-.8-5.5-4.5-9.2-10-10 5.5-.8 9.2-4.5 10-10Z" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur pt-[env(safe-area-inset-top)] print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          <ZiweiMark className="h-[18px] w-[18px] shrink-0 text-zhu drop-shadow-[0_0_7px_rgba(61,90,133,0.35)] transition-transform duration-300 group-hover:rotate-12" />
          <span className="whitespace-nowrap font-serif text-[15px] font-semibold tracking-[0.16em] text-ink">
            紫微助手
          </span>
          <span className="hidden text-[10px] tracking-[0.3em] text-ink-3/70 sm:inline">
            ZIWEI ASSISTANT
          </span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
