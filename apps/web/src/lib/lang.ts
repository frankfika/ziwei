'use client';

/**
 * 语言切换（中文 / English）—— **只作用于额度相关文案**。
 *
 * 全站 i18n 不在本次范围：站点其余部分仍是中文。
 * 这里只提供一个极小的「当前语言」状态 + 订阅，供额度墙 / 状态行读取。
 *
 * 存储在 localStorage（本机），刷新不丢；SSR 阶段固定 zh，避免 hydration 不一致。
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { Lang } from './quotaCopy';

const STORAGE_KEY = 'ziwei_lang';
const EVENT = 'ziwei:lang';

let current: Lang = 'zh';
let loaded = false;

/** 读一次 localStorage（仅浏览器） */
function load(): Lang {
  if (loaded) return current;
  loaded = true;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'zh') current = v;
  } catch {
    /* localStorage 不可用（隐私模式）——保持默认中文 */
  }
  return current;
}

function emit(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function getLang(): Lang {
  return load();
}

/** 设置语言并广播（同一标签页内所有订阅者一起更新） */
export function setLang(lang: Lang): void {
  current = lang;
  loaded = true;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* 存不下就算了，本次会话内仍然生效 */
  }
  emit();
}

function subscribe(onChange: () => void): () => void {
  load();
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** 订阅当前语言 */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, load, () => 'zh' as Lang);
  const toggle = useCallback((l: Lang) => setLang(l), []);
  return [lang, toggle];
}
