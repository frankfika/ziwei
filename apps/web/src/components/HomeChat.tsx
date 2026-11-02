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
import { useHistory, chartUrl } from '@/lib/history';
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

export default function HomeChat({ providerConfigured = true }: { providerConfigured?: boolean }) {
  const { history } = useHistory();
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

  // 没有档案时：把「新建档案」折叠区自动展开 —— 首屏第一件事就是录入生辰
  useEffect(() => {
    if (history.length === 0) {
      document.getElementById('new-profile')?.setAttribute('open', '');
    }
  }, [history.length]);

  if (history.length === 0) {
    return (
      <div className="panel-ritual p-5 text-center sm:p-6">
        <p className="text-sm text-ink">还没有档案</p>
        <p className="mt-2 text-2xs leading-relaxed text-ink-3">
          在下方录入生辰排一张盘，之后打开首页就能直接接着聊。
        </p>
      </div>
    );
  }

  const identity = resolved?.ok && resolved.resolved
    ? `${resolved.resolved.year}-${resolved.resolved.month}-${resolved.resolved.day}-${resolved.resolved.hour}-${selected!.form.gender}`
    : selected?.id ?? 'none';

  const aiReady = providerConfigured || userAi;

  return (
    <div>
      {/* AI 状态：内置 AI 可用时告诉用户额度，别让「⚙ AI 设置」看起来像必填项 */}
      {providerConfigured && !userAi && !showConfig ? (
        <p className="mb-3 text-2xs text-ink-3">
          已内置 AI，每天 10 次免费提问；点上方「⚙ AI 设置」可换成自己的 Key（不限量）。
        </p>
      ) : (
        !aiReady &&
        !showConfig && (
          <p className="mb-3 text-2xs text-ink-3">
            AI 还没配置 —— 点上方「⚙ AI 设置」填一个 API Key（只存本机）。
          </p>
        )
      )}
      {showConfig && (
        <div className="mb-4">
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
              onClick={() => setSelectedId(entry.id)}
              className={`${PROFILE_CHIP_CLASS} ${
                active
                  ? 'border-zhu bg-zhu-soft text-ink'
                  : 'border-line bg-surface text-ink-2 hover:border-ink-3'
              }`}
            >
              {entry.label}
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

      {/* 查看命盘：紧跟档案芯片，不占一整行 */}
      {selected && chartUrl(selected.form) && (
        <p className="mb-3">
          <Link
            href={chartUrl(selected.form)!}
            className="text-2xs text-ink-3 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            查看命盘 →
          </Link>
        </p>
      )}

      {/* 对话线程：key 随档案切换，线程按盘隔离存储 */}
      {resolved?.ok && resolved.resolved ? (
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
          bare
        />
      ) : (
        <div className="panel p-5 text-center" role="status">
          <p className="text-xs text-ink-2">这个档案的生辰不完整，无法对话。请重新排盘。</p>
        </div>
      )}
    </div>
  );
}
