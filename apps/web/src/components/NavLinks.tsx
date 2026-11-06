'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';

const NAV = [
  { href: '/new', label: '开始排盘' },
  { href: '/about', label: '关于与口径' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname() || '/';
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];

  const linkClass = (current: boolean) =>
    `inline-flex min-h-9 items-center whitespace-nowrap rounded-md px-2 py-1.5 text-xs tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:px-3 ${
      current ? 'bg-paper text-ink' : 'text-ink-2 hover:bg-paper hover:text-ink'
    }`;

  return (
    <nav className="flex items-center gap-1" aria-label="主导航">
      {NAV.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={linkClass(current)}
          >
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/account"
        aria-current={isCurrent(pathname, '/account') ? 'page' : undefined}
        className={linkClass(isCurrent(pathname, '/account'))}
      >
        {copy.navAccount}
      </Link>
    </nav>
  );
}
