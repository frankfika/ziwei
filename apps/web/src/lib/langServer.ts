/**
 * 服务端安全的小工具 —— 从 cookie 读语言。
 *
 * 单独成文件：lang.ts 顶部有 'use client'（它导出 useLang hook），
 * 服务端组件不能从客户端模块导入函数。
 */
import type { Lang } from './quotaCopy';

/** cookie 里的语言（服务端用）：没写就按中文 */
export function langFromCookie(value: string | undefined): Lang {
  return value === 'en' ? 'en' : 'zh';
}

/**
 * 切语言时同步 document.title —— SSR metadata 刷新才生效，切换后立刻跟上。
 * 标题词表与 app/layout.tsx 的 META 保持一致（改一处要改另一处）。
 * 只在浏览器调用（typeof document 守卫）。
 */
const DOC_TITLE: Record<Lang, { home: string; suffix: string }> = {
  zh: { home: '紫微助手 — 紫微斗数排盘与解读', suffix: '· 紫微助手' },
  en: { home: 'Ziwei Assistant — cast & read a Zi Wei Dou Shu chart', suffix: '· Ziwei Assistant' },
};

export function syncDocumentTitle(lang: Lang): void {
  if (typeof document === 'undefined') return;
  const from = DOC_TITLE[lang === 'zh' ? 'en' : 'zh'];
  const to = DOC_TITLE[lang];
  if (document.title === from.home) document.title = to.home;
  else if (document.title.includes(from.suffix))
    document.title = document.title.replace(from.suffix, to.suffix);
  else document.title = to.home;
}
