import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export const metadata: Metadata = {
  title: {
    default: '紫微助手 — 紫微斗数排盘与解读',
    template: '%s · 紫微助手',
  },
  description:
    '输入公历生辰与时辰，即刻排出十二宫命盘，并给出 13 维解读。排盘由确定性引擎完成，解读来自紫微斗数开源解读数据集。',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
