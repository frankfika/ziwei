'use client';

/**
 * 首页对话主壳（frankfika 形态）：
 * 选人（星册档案）→ 一条对话线程跟着这个人走，打开就是上次的对话。
 * 意图芯片 = 问事向导：点「感情」等于选了事类，问句由芯片代拟。
 * 对话只存在本机；回答只依据数据集原文，未覆盖的盘会如实说明。
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AskPanel, { type AskQuickPrompt } from './AskPanel';
import AiConfigPanel from './AiConfigPanel';
import LangToggle from './LangToggle';
import { readUserConfig } from '@/lib/aiConfig';
import { useHistory, chartUrl, detailLabel, displayName, shortLabel } from '@/lib/history';
import { resolveForm } from '@/lib/birth';
import { useLang } from '@/lib/lang';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useQuotaStatus } from '@/lib/useQuota';

const INTENT_CHIPS: AskQuickPrompt[] = [
  { label: '今年如何', question: '今年（流年）整体如何？流年命宫和流年四化带来了什么变化？', time: 'liunian', featured: true, hint: '流年命宫与四化' },
  { label: '这十年', question: '当前这步大限（十年运限）整体如何？大限命宫和大限四化怎么看？', time: 'daxian', hint: '当前大限的十年走向' },
  { label: '整体格局', question: '这份命盘的整体格局是怎样的？原文怎么定性的？', dimension: 'overview', hint: '原局整体定性' },
  { label: '感情', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love', featured: true, hint: '婚姻与相处模式' },
  { label: '事业', question: '事业方向上，这份命盘有什么特点？', dimension: 'career', featured: true, hint: '适合的方向与特点' },
  { label: '财运', question: '财运方面，原文给了哪些倾向？', dimension: 'wealth', featured: true, hint: '原文给出的倾向' },
  { label: '健康', question: '健康方面，原文里有没有要留意的地方？', dimension: 'health', hint: '需要留意的部分' },
];

const PROFILE_CHIP_CLASS =
  'shrink-0 rounded-full border px-3.5 py-2 text-xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

/** 顶部小链接：新建档案 / 双人合盘 —— 都在聊天区之外，不挤对话 */
const TOOL_LINK_CLASS =
  'inline-flex min-h-9 items-center gap-1 rounded-full border border-zhu/30 bg-zhu-soft/50 px-3 py-1.5 text-xs text-zhu transition-colors hover:border-zhu hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

export default function HomeChat({
  providerConfigured = true,
  serverModel,
}: {
  providerConfigured?: boolean;
  /** 服务端内置 AI 的模型名（展示用，不含密钥） */
  serverModel?: string;
}) {
  const { history, ready } = useHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [userAi, setUserAi] = useState(false);
  // 额度相关文案：中英可切；额度上限以服务端为准
  const [lang] = useLang();
  const quota = useQuotaStatus();
  const copy = QUOTA_COPY[lang];

  // 客户端配置状态：挂载与打开面板后都刷新
  useEffect(() => {
    setUserAi(!!readUserConfig());
  }, [showConfig]);
  const selected = history.find((e) => e.id === selectedId) ?? history[0] ?? null;

  const resolved = useMemo(
    () => (selected ? resolveForm(selected.form) : null),
    [selected],
  );

  // 档案库还没读完（挂载第一帧 history 恒为 []）：先别渲染，免得闪一下「还没有档案」
  if (!ready) return null;

  if (history.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-title text-ink">还没有档案</p>
        <p className="max-w-xs text-xs leading-relaxed text-ink-2">
          先排一张盘，之后打开首页就能直接接着聊。
        </p>
        <Link
          href="/new"
          className="mt-1 inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,90,133,0.24)] transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          去排一张盘
        </Link>
      </div>
    );
  }

  const identity = resolved?.ok && resolved.resolved
    ? `${resolved.resolved.year}-${resolved.resolved.month}-${resolved.resolved.day}-${resolved.resolved.hour}-${selected!.form.gender}`
    : selected?.id ?? 'none';

  const aiReady = providerConfigured || userAi;
  const name = displayName(selected!);
  const chart = chartUrl(selected!.form);
  const userCfg = userAi ? readUserConfig() : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showConfig && (
        <div className="mb-3">
          <AiConfigPanel
            onClose={() => setShowConfig(false)}
            serverAiReady={providerConfigured}
            serverModel={serverModel}
          />
        </div>
      )}

      {/* 状态胶囊独占一行：说清「现在用谁」，点它开 AI 设置（设置入口只留这一处） */}
      <div className="mb-2.5">
        <button
          type="button"
          onClick={() => setShowConfig((v) => !v)}
          data-ai-status
          title="点开 AI 设置"
          className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[11px] leading-snug text-ink-2 transition-colors hover:border-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu sm:text-xs sm:leading-normal"
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${aiReady ? 'bg-hua-lu' : 'bg-danger'}`}
          />
          {userCfg ? (
            <>{copy.statusUser(userCfg.model)}</>
          ) : providerConfigured ? (
            quota.vip ? (
              <>{copy.statusVip(serverModel ? serverModel : '内置模型', quota.limit)}</>
            ) : (
              <>{copy.statusBuiltin(serverModel ? serverModel : '内置模型', quota.limit)}</>
            )
          ) : (
            <span className="text-danger">{copy.noAiStatus}</span>
          )}
          <span aria-hidden="true" className="text-ink-3">
            ⚙
          </span>
        </button>
        <LangToggle />
      </div>

      {/* 档案行：档案芯片 + 新建/合盘 —— 都是「管档案」的动作，放一行横向滚动 */}
      <div
        className="-mx-2 mb-3 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="选择档案"
      >
        {history.map((entry) => {
          const active = entry.id === selected?.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={entry.label}
              onClick={() => setSelectedId(entry.id)}
              className={`${PROFILE_CHIP_CLASS} ${
                active
                  ? 'border-zhu bg-zhu-soft text-ink'
                  : 'border-line bg-surface text-ink-2 hover:border-ink-3'
              }`}
            >
              {shortLabel(entry)}
            </button>
          );
        })}
        <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line" />
        <Link href="/new" className={TOOL_LINK_CLASS}>
          ＋ 新建档案
        </Link>
        <Link href="/synastry" className={TOOL_LINK_CLASS}>
          双人合盘 →
        </Link>
      </div>

      {/* 对话线程：key 随档案切换，线程按盘隔离存储。
          面板占满剩余高度，线程内部滚动 —— 输入框始终钉在聊天区底部 */}
      {resolved?.ok && resolved.resolved ? (
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-line bg-surface-2/40 px-3 py-3 sm:px-4">
          {/* 面板头：说清现在问的是哪张盘 */}
          <div className="mb-2.5 flex shrink-0 items-baseline justify-between gap-3 border-b border-line/70 pb-2.5">
            <p className="min-w-0 truncate text-sm text-ink">
              {name && <span className="font-medium">{name}</span>}
              {name && <span className="text-ink-3"> · </span>}
              <span className="text-xs text-ink-2">{detailLabel(selected!.form)}</span>
            </p>
            {chart && (
              <Link
                href={chart}
                className="shrink-0 text-xs text-zhu underline underline-offset-2 transition-colors hover:text-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                查看命盘 →
              </Link>
            )}
          </div>
          <AskPanel
            key={identity}
            year={resolved.resolved.year}
            month={resolved.resolved.month}
            day={resolved.resolved.day}
            hour={resolved.resolved.hour}
            gender={selected!.form.gender}
            available
            providerConfigured={providerConfigured}
            quickPrompts={INTENT_CHIPS}
            subjectName={name || undefined}
            bare
          />
        </div>
      ) : (
        <div className="panel flex flex-1 items-center justify-center p-5 text-center" role="status">
          <p className="text-xs text-ink-2">这个档案的生辰不完整，无法对话。请重新排盘。</p>
        </div>
      )}
    </div>
  );
}
