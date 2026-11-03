import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import FloatingAsk from '@/components/FloatingAsk';
import { describeProviderEnv, readProviderEnv } from '@ziwei/ask';

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
  themeColor: '#F6F2E9',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const provider = describeProviderEnv();
  const serverModel = provider.ok ? readProviderEnv().model : undefined;

  return (
    <html lang="zh-CN">
      {/* App-shell：body 锁定视口高（100vh，支持的浏览器升级到 100dvh），
          各页面的滚动都发生在 main 内部 —— 对话再长也不会把页面越拖越长。
          用 supports 渐进增强，老浏览器回落 100vh；不用 env()/自定义属性，不会整条失效 */}
      <body className="flex h-screen flex-col overflow-hidden supports-[height:100dvh]:h-[100dvh]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zhu focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
        >
          跳到主要内容
        </a>
        <SiteHeader />
        <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
        <FloatingAsk serverAiReady={describeProviderEnv().ok} serverModel={serverModel} />
      </body>
    </html>
  );
}
