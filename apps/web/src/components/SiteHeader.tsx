import Link from 'next/link';

const NAV = [
  { href: '/', label: '开始排盘' },
  { href: '/about', label: '关于与口径' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="group flex items-baseline gap-2.5">
          <span className="font-serif text-lg font-semibold tracking-[0.2em] text-ink">
            紫微助手
          </span>
          <span className="hidden text-2xs tracking-[0.25em] text-ink-3 sm:inline">
            ZIWEI ASSISTANT
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-xs tracking-wide text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
