'use client';

/**
 * 语言上下文 —— 服务端按 cookie 注入初始语言，客户端只做「用户在本机改过」的微调。
 *
 * 为什么要有它：语言原本只存在 localStorage，SSR 只能渲染中文，英文用户每次加载
 * 都会先闪一下中文。cookie 让服务端知道当前语言，首屏就是对的。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Lang } from './quotaCopy';

const STORAGE_KEY = 'ziwei_lang';

export interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangCtx = createContext<LangContextValue | null>(null);

export function LangProvider({
  initialLang,
  children,
}: {
  /** 服务端从 cookie 读到的语言 */
  initialLang: Lang;
  children: ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  // 挂载后以本机偏好为准：这台机器上选过语言、但 cookie 是旧值的情况
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'en' || v === 'zh') setLangState(v);
    } catch {
      /* 隐私模式下读不到就沿用 cookie 的语言 */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* 存不下就算了，本次会话内仍然生效 */
    }
    document.cookie = `${STORAGE_KEY}=${l}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

/** 上下文值（没有 Provider 时返回 null —— 组件自行降级） */
export function useLangContext(): LangContextValue | null {
  return useContext(LangCtx);
}
