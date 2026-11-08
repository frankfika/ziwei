'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/lang';
import { CHAT_COPY } from '@/lib/chatCopy';
import LangToggle from './LangToggle';

const NAV = [
  { href: '/new', key: 'navNew' },
  { href: '/about', key: 'navAbout' },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavLinks() {
  const pathname = usePathname() || '/';
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];

  const linkClass = (current: boolean) =>
    `inline-flex min-h-9 items-center whitespace-nowrap rounded-md px-2 py-1.5 text-xs tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:px-3 ${
      current ? 'bg-paper text-ink' : 'text-ink-2 hover:bg-paper hover:text-ink'
    }`;

  return (
    <nav className="flex items-center gap-1" aria-label={copy.navAria}>
      {NAV.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={linkClass(current)}
          >
            {copy[item.key]}
          </Link>
        );
      })}
      {/* 语言开关放在全局导航里：任何页面一键中/EN */}
      <LangToggle className="ml-0.5" />
    </nav>
  );
}
