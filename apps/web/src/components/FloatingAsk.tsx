'use client';

/**
 * 左下角悬浮追问机器人 —— 追问不跳转。
 *
 * 任何页面唤起；「就此追问」等入口派发 `ziwei:ask` 自定义事件，
 * 这里监听并就地打开面板、自动提交，用户不离开当前内容。
 * 盘的来源：事件带的生辰（盘页/首页最精确）> 最近档案（localStorage）。
 * AI 配置入口内置：自己填 provider / key / 模型，存本机。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import AskPanel, { type AskSeed } from './AskPanel';
import AiConfigPanel from './AiConfigPanel';
import { readUserConfig } from '@/lib/aiConfig';
import { useHistory } from '@/lib/history';
import { resolveForm } from '@/lib/birth';

/** 「就此追问」事件的载荷：问句 + 焦点 + 可选的盘 */
export interface ZiweiAskEventDetail {
  question: string;
  dimension?: string;
  palace?: string;
  time?: 'liunian' | 'daxian';
  birth?: { year: number; month: number; day: number; hour: number; gender: 'male' | 'female' };
}

/** 全局派发一个追问事件（供宫格/解读维度/中宫入口调用） */
export function dispatchZiweiAsk(detail: ZiweiAskEventDetail): void {
  window.dispatchEvent(new CustomEvent<ZiweiAskEventDetail>('ziwei:ask', { detail }));
}

type PanelBirth = { year: number; month: number; day: number; hour: number; gender: 'male' | 'female' };

export default function FloatingAsk() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [seed, setSeed] = useState<AskSeed | null>(null);
  const [eventBirth, setEventBirth] = useState<PanelBirth | null>(null);
  const { history } = useHistory();
  const [aiConfigured, setAiConfigured] = useState(false);

  // 打开面板时刷新 AI 配置状态（设置完回来不用刷新）
  useEffect(() => {
    if (open) setAiConfigured(!!readUserConfig());
  }, [open, showConfig]);

  // 监听全局追问事件：打开面板 + 自动提交
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ZiweiAskEventDetail>).detail;
      if (!detail?.question) return;
      if (detail.birth) setEventBirth(detail.birth);
      setSeed({
        id: Date.now(),
        question: detail.question,
        ...(detail.dimension ? { dimension: detail.dimension } : {}),
        ...(detail.palace ? { palace: detail.palace } : {}),
        ...(detail.time ? { time: detail.time } : {}),
      });
      setOpen(true);
      setShowConfig(false);
    };
    window.addEventListener('ziwei:ask', handler);
    return () => window.removeEventListener('ziwei:ask', handler);
  }, []);

  // 盘的解析：事件带的生辰 > 最近档案
  const fallback = useMemo<PanelBirth | null>(() => {
    const entry = history[0];
    if (!entry) return null;
    const r = resolveForm(entry.form);
    if (!r.ok || !r.resolved) return null;
    return {
      year: r.resolved.year,
      month: r.resolved.month,
      day: r.resolved.day,
      hour: r.resolved.hour,
      gender: entry.form.gender,
    };
  }, [history]);

  const birth = eventBirth ?? fallback;
  const identity = birth
    ? `${birth.year}-${birth.month}-${birth.day}-${birth.hour}-${birth.gender}`
    : 'none';

  const close = useCallback(() => {
    setOpen(false);
    setSeed(null);
  }, []);

  // 首页本身就是对话，悬浮球只出现在其余页面
  if (pathname === '/') return null;

  return (
    <>
      {/* 悬浮球：左下角，避开移动端底 tab */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开追问助手"
          data-floating-ask-toggle
          className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] left-3 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-xl shadow-[0_8px_24px_rgba(46,42,35,0.2)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu md:bottom-6 md:left-6"
        >
          <span aria-hidden="true">💬</span>
        </button>
      )}

      {/* 对话面板 */}
      {open && (
        <div
          role="dialog"
          aria-label="追问助手"
          data-floating-ask-panel
          className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-2 right-2 z-50 max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-paper p-3 shadow-[0_16px_48px_rgba(46,42,35,0.25)] sm:left-auto sm:w-[26rem] md:bottom-24 md:left-6"
        >
          <div className="mb-1 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              aria-label={aiConfigured ? 'AI 已配置' : '配置 AI'}
              title={aiConfigured ? 'AI 已配置' : '配置 AI'}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                aiConfigured ? 'text-zhu' : 'text-ink-3 hover:text-ink'
              }`}
            >
              ⚙
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="收起追问助手"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-2xs text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              ✕
            </button>
          </div>

          {showConfig && (
            <div className="mb-3">
              <AiConfigPanel onClose={() => setShowConfig(false)} />
            </div>
          )}

          {birth ? (
            <AskPanel
              key={identity}
              year={birth.year}
              month={birth.month}
              day={birth.day}
              hour={birth.hour}
              gender={birth.gender}
              available
              seed={seed ?? undefined}
              quickPrompts={[
                { label: '今年如何', question: '今年（流年）整体如何？流年命宫和流年四化带来了什么变化？', time: 'liunian' },
                { label: '这十年', question: '当前这步大限整体如何？大限命宫和大限四化怎么看？', time: 'daxian' },
                { label: '感情', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love' },
                { label: '事业', question: '事业方向上，这份命盘有什么特点？', dimension: 'career' },
              ]}
              bare
            />
          ) : (
            <p className="p-4 text-center text-xs text-ink-3">
              还没有档案。先在首页录入一张命盘，再来追问。
            </p>
          )}
        </div>
      )}
    </>
  );
}
