import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import FloatingAsk from '@/components/FloatingAsk';
import { describeProviderEnv, readProviderEnv } from '@ziwei/ask';
import { langFromCookie } from '@/lib/langServer';
import { LangProvider } from '@/lib/LangProvider';

/** 站点 metadata 的中英文案 */
const META = {
  zh: {
    title: '紫微助手 — 紫微斗数排盘与解读',
    template: '%s · 紫微助手',
    description:
      '输入公历生辰与时辰，即刻排出十二宫命盘，并给出 13 维解读。排盘由确定性引擎完成，解读来自紫微斗数开源解读数据集。',
    applicationName: '紫微助手',
    keywords: ['紫微斗数', '排盘', '命盘', '十三维解读', '开源数据集'],
    ogTitle: '紫微助手 — 紫微斗数排盘与解读',
    ogDescription: '确定性排盘 + 数据集原文检索。未覆盖生辰如实提示，不做补写。',
    locale: 'zh_CN',
    twitterDescription: '确定性排盘 + 数据集原文检索，不做模型补写。',
    skipToContent: '跳到主要内容',
    htmlLang: 'zh-CN',
  },
  en: {
    title: 'Ziwei Assistant — cast & read a Zi Wei Dou Shu chart',
    template: '%s · Ziwei Assistant',
    description:
      'Enter a Gregorian birth date and hour to cast a twelve-palace Zi Wei Dou Shu chart and read a 13-dimension interpretation. The chart is deterministic; the reading comes from an open interpretation dataset.',
    applicationName: 'Ziwei Assistant',
    keywords: ['Zi Wei Dou Shu', 'astrology chart', 'chart casting', 'open dataset'],
    ogTitle: 'Ziwei Assistant — cast & read a Zi Wei Dou Shu chart',
    ogDescription:
      'Deterministic chart casting + verbatim dataset retrieval. Birth data outside the dataset is reported honestly — never invented.',
    locale: 'en_US',
    twitterDescription: 'Deterministic chart casting + verbatim dataset retrieval. No model-written filler.',
    skipToContent: 'Skip to main content',
    htmlLang: 'en',
  },
} as const;

/** 语言来自 cookie（切语言时写入）—— 服务端据此出 metadata 与 <html lang> */
async function currentLang(): Promise<'zh' | 'en'> {
  const jar = await cookies();
  return langFromCookie(jar.get('ziwei_lang')?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await currentLang();
  const m = META[lang];
  return {
    title: {
      default: m.title,
      template: m.template,
    },
    description: m.description,
    applicationName: m.applicationName,
    keywords: [...m.keywords],
    authors: [{ name: m.applicationName }],
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      locale: m.locale,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: m.ogTitle,
      description: m.twitterDescription,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F2E9',
  colorScheme: 'light',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const provider = describeProviderEnv();
  const serverModel = provider.ok ? readProviderEnv().model : undefined;
  const lang = await currentLang();
  const m = META[lang];

  return (
    <html lang={m.htmlLang}>
      {/* App-shell：body 锁定视口高（100vh，支持的浏览器升级到 100dvh），
          各页面的滚动都发生在 main 内部 —— 对话再长也不会把页面越拖越长。
          用 supports 渐进增强，老浏览器回落 100vh；不用 env()/自定义属性，不会整条失效 */}
      <body className="flex h-screen flex-col overflow-hidden supports-[height:100dvh]:h-[100dvh]">
        {/* 语言上下文：服务端按 cookie 给初始语言，英文用户首屏不闪中文 */}
        <LangProvider initialLang={lang}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-zhu focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg"
          >
            {m.skipToContent}
          </a>
          <SiteHeader />
          <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
          <FloatingAsk serverAiReady={describeProviderEnv().ok} serverModel={serverModel} />
        </LangProvider>
      </body>
    </html>
  );
}
