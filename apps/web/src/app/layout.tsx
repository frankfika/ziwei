import type { Metadata, Viewport } from 'next';
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
  applicationName: '紫微助手',
  keywords: ['紫微斗数', '排盘', '命盘', '十三维解读', '开源数据集'],
  authors: [{ name: '紫微助手' }],
  openGraph: {
    title: '紫微助手 — 紫微斗数排盘与解读',
    description:
      '确定性排盘 + 数据集原文检索。未覆盖生辰如实提示，不做补写。',
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: '紫微助手 — 紫微斗数排盘与解读',
    description: '确定性排盘 + 数据集原文检索，不做模型补写。',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f1ea',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zhu focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
        >
          跳到主要内容
        </a>
        <SiteHeader />
        <main id="main-content" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
