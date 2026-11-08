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
