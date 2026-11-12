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
import { chartKey, detailLabel, displayName, useHistory } from '@/lib/history';
import { resolveForm } from '@/lib/birth';
import { INTENT_CHIPS } from '@/lib/topicChips';
import { useLang } from '@/lib/lang';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { CHAT_COPY } from '@/lib/chatCopy';

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

/** 命盘页的盘以当前 URL 为准（不猜历史档案 —— 看着 B 的盘聊 A 的盘是最糟的错指引） */
function birthFromUrl(): PanelBirth | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const year = Number(q.get('y'));
  const month = Number(q.get('m'));
  const day = Number(q.get('d'));
  const hour = Number(q.get('h'));
  const gender = q.get('g');
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || hour < 0 || hour > 11 ||
    (gender !== 'male' && gender !== 'female')
  ) return null;
  return { year, month, day, hour, gender };
}

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
  /** 点开那一刻从 URL 读到的盘（命盘页）；非命盘页为 null */
  const [urlBirth, setUrlBirth] = useState<PanelBirth | null>(null);
  const { history } = useHistory();
  const [userAi, setUserAi] = useState(false);
  // 额度相关文案：中英可切；额度上限以服务端为准（可能被 env 覆盖）
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const chat = CHAT_COPY[lang];

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

  // 盘的解析：事件带的生辰 > 当前页 URL 的盘（命盘页）> 最近档案（其余页面）
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

  const birth = eventBirth ?? urlBirth ?? fallback;
  const identity = birth
    ? `${birth.year}-${birth.month}-${birth.day}-${birth.hour}-${birth.gender}`
    : 'none';

  /** 盘主名：档案里认这张盘（认不到就空）—— 会话头要让人知道在聊谁 */
  const subjectName = useMemo(() => {
    if (!birth) return '';
    const key = chartKey(birth);
    const entry = history.find((e) => {
      const r = resolveForm(e.form);
      if (!r.ok || !r.resolved) return false;
      return chartKey({ ...r.resolved, gender: e.form.gender }) === key;
    });
    return entry ? displayName(entry) || detailLabel(entry.form) : '';
  }, [birth, history]);

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
          onClick={() => {
            // 手动点开：以当前页为准（命盘页 = URL 里的盘），清掉上一次事件的盘
            setEventBirth(null);
            setUrlBirth(onChartPage ? birthFromUrl() : null);
            setOpen(true);
          }}
          aria-label={chat.openAskAria}
          data-floating-ask-toggle
          className={`fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] left-3 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-zhu text-base font-medium text-white shadow-[0_8px_24px_rgba(46,42,35,0.3)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu md:left-auto md:right-6 ${bottomClass}`}
        >
          <span aria-hidden="true">{chat.askGlyph}</span>
        </button>
      )}

      {/* 对话面板：全屏接管，避免与盘页信息叠在一起 */}
      {open && (
        <div
          role="dialog"
          aria-label={chat.askPanelTitle}
          data-floating-ask-panel
          className="fixed inset-0 z-50 flex flex-col bg-paper"
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-lineSoft px-4 pt-[env(safe-area-inset-top)] sm:px-6">
            <span className="text-sm tracking-[0.2em] text-ink">{chat.askPanelTitle}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowConfig((v) => !v)}
                aria-label={aiConfigured ? chat.aiReadyAria : chat.aiSetupAria}
                title={aiConfigured ? chat.aiReadyAria : chat.aiSetupAria}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                  aiConfigured ? 'text-zhu' : 'text-ink-2 hover:text-ink'
                }`}
              >
                ⚙
              </button>
              <button
                type="button"
                onClick={close}
                aria-label={chat.closeAskAria}
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

          {!aiConfigured && (
            <p className="shrink-0 px-4 pt-2 text-2xs text-danger sm:px-6">
              {chat.noAiStatusLocal}
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
                onOpenConfig={() => setShowConfig(true)}
                quickPrompts={INTENT_CHIPS}
                {...(subjectName ? { subjectName } : {})}
                {...(birth && !onChartPage
                  ? {
                      chartHref: `/chart?y=${birth.year}&m=${birth.month}&d=${birth.day}&h=${birth.hour}&g=${birth.gender}`,
                    }
                  : {})}
                bare
              />
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center p-4 text-center text-xs text-ink-2">
              {chat.noProfileHint}
            </p>
          )}
        </div>
      )}
    </>
  );
}
