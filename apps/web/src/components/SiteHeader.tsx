import Link from 'next/link';
import NavLinks from './NavLinks';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur pt-[env(safe-area-inset-top)] print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="group flex items-baseline gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          <span className="font-serif text-lg font-semibold tracking-[0.2em] text-ink">
            紫微助手
          </span>
          <span className="hidden text-2xs tracking-[0.25em] text-ink-3 sm:inline">
            ZIWEI ASSISTANT
          </span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
