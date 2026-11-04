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
import LangToggle from './LangToggle';
import { readUserConfig } from '@/lib/aiConfig';
import { useHistory } from '@/lib/history';
import { resolveForm } from '@/lib/birth';
import { useLang } from '@/lib/lang';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useQuotaStatus } from '@/lib/useQuota';

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

export default function FloatingAsk({
  serverAiReady = false,
  serverModel,
}: {
  serverAiReady?: boolean;
  /** 服务端内置 AI 的模型名（展示用，不含密钥） */
  serverModel?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [seed, setSeed] = useState<AskSeed | null>(null);
  const [eventBirth, setEventBirth] = useState<PanelBirth | null>(null);
  const { history } = useHistory();
  const [userAi, setUserAi] = useState(false);
  // 额度相关文案：中英可切；额度上限以服务端为准（可能被 env 覆盖）
  const [lang] = useLang();
  const quota = useQuotaStatus();
  const copy = QUOTA_COPY[lang];

  // 打开面板时刷新 AI 配置状态（设置完回来不用刷新）
  useEffect(() => {
    if (open) setUserAi(!!readUserConfig());
  }, [open, showConfig]);

  // 内置 AI（服务端默认）或自配 Key 任一可用即可对话
  const aiConfigured = serverAiReady || userAi;

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

  // 首页本身就是对话，悬浮球只出现在其余页面；排盘表单页也要让位，别压住表单
  if (pathname === '/' || pathname === '/new') return null;

  // 盘面页底部有「命盘 | 解读」底栏 + 图例行，球要抬到图例之上；其余页面贴底
  const onChartPage = pathname.startsWith('/chart');
  const bottomClass = onChartPage
    ? 'bottom-[calc(var(--chart-tab)+3.5rem)] md:bottom-[calc(var(--chart-tab)+4rem)]'
    : 'bottom-[calc(72px+env(safe-area-inset-bottom,0px))] md:bottom-6';

  return (
    <>
      {/* 悬浮球：左下角，避开移动端底 tab */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开追问助手"
          data-floating-ask-toggle
          className={`fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] left-3 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-zhu text-base font-medium text-white shadow-[0_8px_24px_rgba(46,42,35,0.3)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu md:left-auto md:right-6 ${bottomClass}`}
        >
          <span aria-hidden="true">问</span>
        </button>
      )}

      {/* 对话面板：全屏接管，避免与盘页信息叠在一起 */}
      {open && (
        <div
          role="dialog"
          aria-label="追问助手"
          data-floating-ask-panel
          className="fixed inset-0 z-50 flex flex-col bg-paper"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-lineSoft px-4 pt-[env(safe-area-inset-top)] sm:px-6">
            <span className="text-sm tracking-[0.2em] text-ink">命盘追问</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                aria-label={aiConfigured ? 'AI 已配置' : '配置 AI'}
                title={aiConfigured ? 'AI 已配置' : '配置 AI'}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                  aiConfigured ? 'text-zhu' : 'text-ink-2 hover:text-ink'
                }`}
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="收起追问助手"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                ✕
              </button>
            </div>
          </div>

          {showConfig && (
            <div className="border-b border-lineSoft px-4 py-3 sm:px-6">
              <div className="mx-auto w-full max-w-2xl">
                <AiConfigPanel
                  onClose={() => setShowConfig(false)}
                  serverAiReady={serverAiReady}
                  serverModel={serverModel}
                />
              </div>
            </div>
          )}

          {!aiConfigured ? (
            <p className="shrink-0 px-4 pt-2 text-2xs text-danger sm:px-6">
              {copy.noAiStatus} —— ⚙（只存本机）
            </p>
          ) : userAi ? (
            <p className="flex shrink-0 items-center gap-2 px-4 pt-2 text-2xs text-ink-2 sm:px-6">
              <span>
                {copy.statusUser(readUserConfig()?.model ?? '')}
                {copy.statusHintUser}
              </span>
              <LangToggle />
            </p>
          ) : (
            <p className="flex shrink-0 items-center gap-2 px-4 pt-2 text-2xs text-ink-2 sm:px-6">
              <span>
                {copy.statusBuiltin(serverModel ?? '内置模型', quota.limit)}
                {copy.statusHint}
              </span>
              <LangToggle />
            </p>
          )}

          {birth ? (
            <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col px-4 sm:px-6">
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
                  { label: '我现在如何', question: '我现在这步运走得怎么样？今年要注意什么？', time: 'liunian' },
                  { label: '这十年', question: '当前这步大限整体如何？大限命宫和大限四化怎么看？', time: 'daxian' },
                  { label: '感情', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love' },
                  { label: '事业', question: '事业方向上，这份命盘有什么特点？', dimension: 'career' },
                ]}
                bare
              />
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center p-4 text-center text-xs text-ink-2">
              还没有档案。先在首页录入一张命盘，再来追问。
            </p>
          )}
        </div>
      )}
    </>
  );
}
