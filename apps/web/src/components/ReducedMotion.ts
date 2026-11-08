'use client';

/**
 * useReducedMotion —— 订阅系统 prefers-reduced-motion（可热切换）。
 * 一次性进场动效按 JS 值调参（短促到察觉不到），
 * 常驻循环动效（呼吸/缓转）的降级在 globals.css 的媒体查询里。
 */

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
