'use client';

/**
 * 首页对话主壳（frankfika 形态）：
 * 选人（星册档案）→ 一条对话线程跟着这个人走，打开就是上次的对话。
 * 意图芯片 = 问事向导：点「感情」等于选了事类，问句由芯片代拟。
 * 对话只存在本机；回答只依据数据集原文，未覆盖的盘会如实说明。
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AskPanel from './AskPanel';
import AiConfigPanel from './AiConfigPanel';
import ErrorAlert from './ErrorAlert';
import StarAtlas from './StarAtlas';
import Seal from './Seal';
import { readUserConfig } from '@/lib/aiConfig';
import { useLang } from '@/lib/lang';
import { CHAT_COPY } from '@/lib/chatCopy';
import { useHistory, chartKey, chartUrl, detailLabel, displayName, shortLabel } from '@/lib/history';
import { dropAskThreads } from '@/lib/askThreads';
import { resolveForm } from '@/lib/birth';

import { INTENT_CHIPS } from '@/lib/topicChips';

/** 当前选中档案持久化 key：刷新 / 从盘页回来不丢「在聊谁」 */
const SELECT_KEY = 'ziwei_selected_profile';

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
  const { history, ready, remove } = useHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [userAi, setUserAi] = useState(false);

  // 客户端配置状态：挂载与打开面板后都刷新
  useEffect(() => {
    setUserAi(!!readUserConfig());
  }, [showConfig]);

  // 恢复上次选中的人：刷新 / 从盘页返回，对话对象不换
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SELECT_KEY);
      if (saved) setSelectedId(saved);
    } catch {
      /* 隐私模式读不到就当没有 */
    }
  }, []);

  // 浮层提示自动消失；卸载时清掉定时器
  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), 2200);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const selected = history.find((e) => e.id === selectedId) ?? history[0] ?? null;

  /** 点档案芯片：换人 + 记住选择 + 浮层确认（切换即换线程，必须让用户知道换了谁） */
  const pickProfile = (id: string) => {
    if (id === selected?.id) return;
    setSelectedId(id);
    try {
      localStorage.setItem(SELECT_KEY, id);
    } catch {
      /* 忽略写入失败 */
    }
    const entry = history.find((e) => e.id === id);
    if (entry) setToast(copy.switchedTo(shortLabel(entry)));
  };

  /** 删除当前档案：级联删对话（不留孤儿数据），并清掉持久化选择 */
  const removeSelected = () => {
    if (!selected) return;
    if (!window.confirm(copy.deleteChartConfirm)) return;
    const removedId = selected.id;
    if (resolved?.ok && resolved.resolved) {
      dropAskThreads(
        chartKey({
          year: resolved.resolved.year,
          month: resolved.resolved.month,
          day: resolved.resolved.day,
          hour: resolved.resolved.hour,
          gender: selected.form.gender,
        }),
      );
    }
    remove(removedId);
    try {
      if (localStorage.getItem(SELECT_KEY) === removedId) localStorage.removeItem(SELECT_KEY);
    } catch {
      /* 忽略 */
    }
    setSelectedId((prev) => (prev === removedId ? null : prev));
  };

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
          {/* 朱砂钤印：古籍落款 */}
          <Seal className="hero-seal absolute bottom-6 right-5" />
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
            onClick={() => pickProfile(entry.id)}
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
    <div className="px-1">
      <p className="text-2xs text-ink-2">
        {name && <span className="font-medium text-ink">{name}</span>}
        {name && ' · '}
        {detailLabel(selected!.form)}
      </p>
      <button
        type="button"
        onClick={removeSelected}
        className="mt-1.5 text-2xs text-ink-3 transition-colors hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
      >
        {copy.deleteChart}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 极简：一行标题，剩下的全是对话。手机端标题收进读屏 —— 对话本身就是这个页面。
          标题在这里渲染：客户端随语言即时切换，不用等刷新 */}
      <h1 className="sr-only mb-4 font-serif text-[1.45rem] leading-snug text-ink sm:not-sr-only sm:block sm:text-[1.6rem]">
        {copy.homeTitle}
      </h1>
      {/* 排盘回跳的错误提示独立于标题（alert 不能嵌在 h1 里） */}
      {errorText && <ErrorAlert>{errorText}</ErrorAlert>}

      {/* 档案芯片常驻顶部：切换命盘是主入口，藏进抽屉会让人找不到 */}
      {profileRow}

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

      {/* 切换档案的浮层确认：换人即换线程，必须有一眼可见的反馈 */}
      {toast && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-5"
        >
          <span className="max-w-full truncate rounded-full bg-ink px-4 py-2 text-xs text-paper shadow-[0_8px_24px_rgba(36,33,29,0.3)]">
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
