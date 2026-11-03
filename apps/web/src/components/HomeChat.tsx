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
import { readUserConfig } from '@/lib/aiConfig';
import { useHistory, chartUrl, detailLabel, displayName, shortLabel } from '@/lib/history';
import { resolveForm } from '@/lib/birth';

const INTENT_CHIPS: AskQuickPrompt[] = [
  { label: '今年如何', question: '今年（流年）整体如何？流年命宫和流年四化带来了什么变化？', time: 'liunian' },
  { label: '这十年', question: '当前这步大限（十年运限）整体如何？大限命宫和大限四化怎么看？', time: 'daxian' },
  { label: '整体格局', question: '这份命盘的整体格局是怎样的？原文怎么定性的？', dimension: 'overview' },
  { label: '感情', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love' },
  { label: '事业', question: '事业方向上，这份命盘有什么特点？', dimension: 'career' },
  { label: '财运', question: '财运方面，原文给了哪些倾向？', dimension: 'wealth' },
  { label: '健康', question: '健康方面，原文里有没有要留意的地方？', dimension: 'health' },
];

const PROFILE_CHIP_CLASS =
  'shrink-0 rounded-full border px-3 py-1.5 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

/** 顶部小链接：新建档案 / 双人合盘 —— 都在聊天区之外，不挤对话 */
const TOOL_LINK_CLASS =
  'inline-flex min-h-8 items-center rounded-md px-1 text-2xs text-ink-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

export default function HomeChat({ providerConfigured = true }: { providerConfigured?: boolean }) {
  const { history, ready } = useHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [userAi, setUserAi] = useState(false);

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
        <p className="text-sm text-ink">还没有档案</p>
        <p className="max-w-xs text-2xs leading-relaxed text-ink-3">
          先排一张盘，之后打开首页就能直接接着聊。
        </p>
        <Link
          href="/new"
          className="inline-flex min-h-10 items-center rounded-lg bg-zhu px-5 py-2 text-sm text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* AI 状态：内置 AI 可用时告诉用户额度，别让「⚙ AI 设置」看起来像必填项 */}
      {providerConfigured && !userAi && !showConfig ? (
        <p className="mb-2 text-2xs text-ink-3">
          已内置 AI，每天 10 次免费提问；点「⚙ AI 设置」可换成自己的 Key（不限量）。
        </p>
      ) : (
        !aiReady &&
        !showConfig && (
          <p className="mb-2 text-2xs text-ink-3">
            AI 还没配置 —— 点「⚙ AI 设置」填一个 API Key（只存本机）。
          </p>
        )
      )}
      {showConfig && (
        <div className="mb-3">
          <AiConfigPanel onClose={() => setShowConfig(false)} />
        </div>
      )}

      {/* 档案选择：星册即「我的人」；末尾常驻 AI 设置入口 */}
      <div
        className="-mx-2 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        <button
          type="button"
          onClick={() => setShowConfig((v) => !v)}
          aria-expanded={showConfig}
          aria-label="AI 设置"
          className={`${PROFILE_CHIP_CLASS} shrink-0 ${
            userAi
              ? 'border-zhu/40 text-zhu hover:border-zhu'
              : 'border-line bg-surface text-ink-2 hover:border-ink-3'
          }`}
        >
          ⚙ AI 设置
        </button>
      </div>

      {/* 排盘入口：新建档案 / 双人合盘 —— 收在聊天区之上，不占对话的地盘 */}
      <div className="mb-2 flex shrink-0 items-center justify-end gap-4">
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
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-lineSoft bg-surface-2/30 px-2 py-3 sm:px-4">
          {/* 面板头：说清现在问的是哪张盘 */}
          <div className="mb-2 flex shrink-0 items-baseline justify-between gap-3 border-b border-lineSoft pb-2">
            <p className="min-w-0 truncate text-xs text-ink">
              {name && <span className="font-medium">{name}</span>}
              {name && ' · '}
              <span className="text-ink-2">{detailLabel(selected!.form)}</span>
            </p>
            {chart && (
              <Link
                href={chart}
                className="shrink-0 text-2xs text-ink-3 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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
