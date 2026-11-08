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
import ErrorAlert from './ErrorAlert';
import StarAtlas from './StarAtlas';
import { readUserConfig } from '@/lib/aiConfig';
import { useLang } from '@/lib/lang';
import { CHAT_COPY } from '@/lib/chatCopy';
import { useHistory, chartUrl, detailLabel, displayName, shortLabel } from '@/lib/history';
import { resolveForm } from '@/lib/birth';

const INTENT_CHIPS: AskQuickPrompt[] = [
  { label: '今年如何', labelEn: 'This year', question: '今年（流年）整体如何？流年命宫和流年四化带来了什么变化？', time: 'liunian', featured: true, hint: '流年命宫与四化', hintEn: 'Annual palace & transformations' },
  { label: '这十年', labelEn: 'This decade', question: '当前这步大限（十年运限）整体如何？大限命宫和大限四化怎么看？', time: 'daxian', hint: '当前大限的十年走向', hintEn: 'The ten-year cycle ahead' },
  { label: '整体格局', labelEn: 'Overall chart', question: '这份命盘的整体格局是怎样的？原文怎么定性的？', dimension: 'overview', hint: '原局整体定性', hintEn: 'The natal chart’s character' },
  { label: '感情', labelEn: 'Love', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love', featured: true, hint: '婚姻与相处模式', hintEn: 'Marriage & how you relate' },
  { label: '事业', labelEn: 'Career', question: '事业方向上，这份命盘有什么特点？', dimension: 'career', featured: true, hint: '适合的方向与特点', hintEn: 'Where you do best' },
  { label: '财运', labelEn: 'Money', question: '财运方面，原文给了哪些倾向？', dimension: 'wealth', featured: true, hint: '原文给出的倾向', hintEn: 'How the text reads it' },
  { label: '健康', labelEn: 'Health', question: '健康方面，原文里有没有要留意的地方？', dimension: 'health', hint: '需要留意的部分', hintEn: 'What to watch' },
];

const PROFILE_CHIP_CLASS =
  'shrink-0 rounded-full border px-3.5 py-2 text-xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

/** 顶部小链接：新建档案 / 双人合盘 —— 都在聊天区之外，不挤对话 */
const TOOL_LINK_CLASS =
  'inline-flex min-h-9 items-center gap-1 rounded-full border border-zhu/30 bg-zhu-soft/50 px-3 py-1.5 text-xs text-zhu transition-colors hover:border-zhu hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

export default function HomeChat({
  providerConfigured = true,
  serverModel,
  errorText = '',
}: {
  providerConfigured?: boolean;
  /** 服务端内置 AI 的模型名（展示用，不含密钥） */
  serverModel?: string;
  /** 排盘回跳的错误提示（query string 带来，随语言即时切换） */
  errorText?: string;
}) {
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-4 text-center">
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
        <h1 className="sr-only">{copy.homeTitle}</h1>

        {/* 古星图 hero：星图先亮 → 竖排主题词浮起 → 钤印盖下 */}
        <div className="relative h-72 w-72 sm:h-[22rem] sm:w-[22rem]">
          <StarAtlas className="hero-atlas h-full w-full" />
          <div className="absolute inset-0 flex items-center justify-center">
            {lang === 'zh' ? (
              <p className="hero-title font-serif text-2xl tracking-[0.42em] text-ink [writing-mode:vertical-rl]">
                {copy.heroTitle}
              </p>
            ) : (
              <p className="hero-title max-w-[9rem] font-serif text-xl leading-snug tracking-wide2 text-ink">
                {copy.heroTitle}
              </p>
            )}
          </div>
          {/* 朱砂钤印：古籍落款，斜 3° 像随手盖下去的（英文版换 ZW，不露中文字） */}
          <div
            aria-hidden="true"
            className="hero-seal absolute bottom-6 right-5 flex h-10 w-10 rotate-3 flex-col items-center justify-center rounded-[3px] bg-hua-ji font-serif text-sm leading-tight text-surface shadow-[0_2px_8px_rgba(193,64,47,0.35)]"
          >
            {lang === 'zh' ? (
              <>
                <span>紫</span>
                <span>微</span>
              </>
            ) : (
              <span className="text-xs tracking-[0.05em]">ZW</span>
            )}
          </div>
        </div>

        <p className="max-w-xs text-xs leading-relaxed text-ink-2">
          {copy.noProfilesBody}
        </p>
        <Link
          href="/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-6 py-2.5 text-sm font-medium text-white shadow-[0_8px_20px_rgba(61,90,133,0.24)] transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.noProfilesCta}
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

  const profileRow = (
    <div
      className="mb-2 flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={copy.profilesAria}
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
        {copy.newProfile}
      </Link>
      <Link href="/synastry" className={TOOL_LINK_CLASS}>
        {copy.synastry}
      </Link>
    </div>
  );

  const sheetExtra = (
    <>
      <p className="mb-2 px-1 text-2xs text-ink-2">
        {name && <span className="font-medium text-ink">{name}</span>}
        {name && ' · '}
        {detailLabel(selected!.form)}
      </p>
      {/* 只有一个档案时收成两枚链接，少给选项 */}
      {history.length > 1 ? profileRow : (
        <p className="flex flex-wrap gap-1.5 px-1 pb-1">
          <Link href="/new" className={TOOL_LINK_CLASS}>
            {copy.newProfile}
          </Link>
          <Link href="/synastry" className={TOOL_LINK_CLASS}>
            {copy.synastry}
          </Link>
        </p>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 极简：一行标题，剩下的全是对话。手机端标题收进读屏 —— 对话本身就是这个页面。
          标题在这里渲染：客户端随语言即时切换，不用等刷新 */}
      <h1 className="sr-only mb-4 font-serif text-[1.45rem] leading-snug text-ink sm:not-sr-only sm:block sm:text-[1.6rem]">
        {copy.homeTitle}
        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}
      </h1>

      {showConfig && (
        <div className="mb-3">
          <AiConfigPanel
            onClose={() => setShowConfig(false)}
            serverAiReady={providerConfigured}
            serverModel={serverModel}
          />
        </div>
      )}

      {/* 对话线程：key 随档案切换，线程按盘隔离存储。
          面板占满剩余高度，线程内部滚动 —— 输入框始终钉在聊天区底部。
          整页只有 AskPanel 的会话头一行钉住，其余（档案/AI/话题切换）全在抽屉里 */}
      {resolved?.ok && resolved.resolved ? (
        <div className="flex min-h-0 flex-1 flex-col px-0 py-1 sm:rounded-2xl sm:border sm:border-line sm:bg-surface-2/40 sm:px-4 sm:py-3">
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
            chartHref={chart ?? undefined}
            aiReady={aiReady}
            onOpenConfig={() => setShowConfig(true)}
            sheetExtra={sheetExtra}
          />
        </div>
      ) : (
        <>
          {sheetExtra}
          <div className="panel flex flex-1 items-center justify-center p-5 text-center" role="status">
            <p className="text-xs text-ink-2">{copy.incompleteBirth}</p>
          </div>
        </>
      )}
    </div>
  );
}
