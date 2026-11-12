'use client';

/**
 * 命盘追问面板（会话式）。
 *
 * 设计要点：
 *  · 问答按线程保存：每张盘的对话存在本机 localStorage，下次打开还在，
 *    后续问题会带上前面对话作为语境（服务端只把上文当语境，引用仍以盘面+原文为准）；
 *  · 每条回答都带**原文引用**（维度名）与机械自检结论，越界内容醒目标出 ——
 *    宁可让用户看见「这条可能超出了你的盘面」，也不静默糊过去；
 *  · provider 未配置 / 样本库未覆盖，**原样显示服务端给的说明**，不自己编措辞。
 */

import { Fragment, useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useLang } from '@/lib/lang';
import { CHAT_COPY, type ChatCopy } from '@/lib/chatCopy';
import { streamAsk, type AskStreamVerification } from '@/lib/askStream';
import { chartKey } from '@/lib/history';
import { useAskThread, MAX_MESSAGES, type AskMessage } from '@/lib/askThreads';
import { DURATION, motionStyle, preferredScrollBehavior } from '@/lib/motion';
import Markdown from './Markdown';
import MiniChart from './MiniChart';
import QuotaWall from './QuotaWall';
import { getChatChart, type ChatChartPayload } from '@/app/chat-chart-action';
import { readUserConfig } from '@/lib/aiConfig';

export interface AskPanelProps {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  /** 样本库未覆盖时为 false —— 此时不展示追问入口 */
  available: boolean;
  /** provider 是否已配置；未配置时仍可提交，服务端会返回明确指引 */
  providerConfigured?: boolean;
  /**
   * 页内追问种子（从解读维度/宫格「就此追问」进来）。
   * id 去重：同一颗种子只消费一次；带 question 则自动提交，否则只做焦点并聚焦输入框。
   */
  seed?: AskSeed;
  /** 意图芯片：替代默认推荐追问（首页对话主壳用） */
  quickPrompts?: AskQuickPrompt[];
  /** 嵌入模式（首页对话）：去掉「命盘追问」折叠头，芯片条固定在输入区上方 */
  bare?: boolean;
  /** 这张盘的显示名：空态里点名「围绕 XX 的盘提问」，别让用户猜是哪张盘 */
  subjectName?: string;
  /** 对话内嵌命盘：回答后就地渲染迷你盘，不跳走 */
  embedChart?: boolean;
  /**
   * bare 会话头右侧的「命盘」链接（首页传入）；不传则不显示。
   * 会话头是整页唯一钉住的行：话题标题（点开对话抽屉）· 命盘 · AI 设置。
   */
  chartHref?: string;
  /** AI 是否就绪：会话头 ⚙ 上的红点提示 */
  aiReady?: boolean;
  /** 点 ⚙ 打开 AI 设置（面板由宿主页渲染） */
  onOpenConfig?: () => void;
  /** 对话抽屉里宿主页的部分：档案切换 / 新建档案 / 合盘 / AI 状态 / 语言 */
  sheetExtra?: ReactNode;
}

export interface AskSeed {
  id: number;
  question?: string;
  dimension?: string;
  palace?: string;
  /** 时间层种子（中宫「就这步运追问」） */
  time?: 'liunian' | 'daxian';
  label?: string;
}

export interface AskQuickPrompt {
  label: string;
  /** 英文界面下的显示名；话题建档仍用 label（中文）作稳定键，切语言不串库 */
  labelEn?: string;
  question: string;
  dimension?: string;
  /** 时间层焦点：流年（今年）/ 大限（这十年） */
  time?: 'liunian' | 'daxian';
  /** 空态大卡片用的一句话说明（比 question 短） */
  hint?: string;
  /** hint 的英文版 */
  hintEn?: string;
  /** 是否进空态大卡片（首页第一次进来时给「点哪儿」的提示） */
  featured?: boolean;
}

const PRESETS = [
  '这份命盘在职业方向上有什么特点？',
  '我的感情运势在原文里是怎么说的？',
  '财运方面，原文给了哪些倾向？',
];

/** 带入下一轮问题的上文轮数 */
const CONTEXT_TURNS = 6;

/** 推荐追问 chip：低反光冷玉，不用高彩紫底 */
const CHIP_CLASS =
  'max-w-full min-h-9 whitespace-normal rounded-full border border-line bg-surface-2 px-3 py-2 text-left text-2xs leading-snug text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

/** 话题行右侧的相对日期：今天 / 昨天 / M/D */
function relDay(ts: number, day: { today: string; yesterday: string }): string {
  const d = new Date(ts);
  const now = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (same(d, now)) return day.today;
  if (same(d, yest)) return day.yesterday;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 对话线程里的日期分隔线：今天 / 昨天 / M月D日（跨年带年份） */
function daySepLabel(ts: number, lang: string, day: { today: string; yesterday: string }): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return day.today;
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return day.yesterday;
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
    });
  }
  return d.getFullYear() !== now.getFullYear()
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 「问」标记：冷玉小方（深底 + 紫字，无高饱和紫底） */
const ASK_MARK_CLASS =
  'mr-1.5 inline-flex min-w-6 items-center justify-center rounded-sm bg-surface px-1.5 py-0.5 text-2xs text-zhu';

/** 回答者身份行：紫圆「紫」字头像 + 名字 + 模型与来源（哪家的 Key）+ tiny 引用维度 */
function AnswerAvatar({
  cited,
  model,
  source,
}: {
  cited?: string[];
  model?: string;
  source?: 'user' | 'builtin';
}) {
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];
  return (
    <p className="mb-1 flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zhu text-[10px] leading-none text-white">
        {copy.answerGlyph}
      </span>
      <span className="text-2xs font-medium text-ink-2">{copy.botName}</span>
      {model && (
        <span className="text-2xs text-ink-2">
          · {model}
          {source === 'user' && copy.sourceUser}
          {source === 'builtin' && copy.sourceBuiltin}
        </span>
      )}
      {cited && cited.length > 0 && (
        <span className="text-2xs text-ink-2">{copy.citedBrief(cited.join(lang === 'en' ? ', ' : '、'))}</span>
      )}
    </p>
  );
}

/** 「正在思考」的实时思维链：只用于等待期进度展示，正文开始流出后让位，不进线程、不持久化 */
function ThinkingBlock({ text, note }: { text: string; note: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [text]);
  return (
    <div className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-2.5" role="status">
      <p className="mb-1 flex items-center gap-1.5 text-2xs text-ink-3">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zhu/70 motion-reduce:animate-none" aria-hidden="true" />
        {note}
      </p>
      <div
        ref={ref}
        aria-hidden="true"
        className="max-h-32 overflow-y-auto whitespace-pre-wrap text-2xs leading-relaxed text-ink-3 [scrollbar-width:thin]"
      >
        {text}
      </div>
    </div>
  );
}

/** 服务端返回的非 ok 状态 / 本地失败 —— 不进线程，作为临时提示展示 */
type Transient =
  | { kind: 'not-covered' | 'not-configured'; message: string }
  | { kind: 'error' | 'local-error'; message: string; retryQuestion: string }
  | {
      kind: 'quota-exceeded';
      message: string;
      limit: number;
      loggedIn: boolean;
      packs: { id: string; asks: number; priceCny: number; priceUsd: number }[];
      checkout: string;
      /** 服务端是否配置了问卷解锁（CPX） */
      survey: boolean;
    };

function suspectsOf(v: AskStreamVerification, copy: ChatCopy): string[] {
  return [
    ...v.suspectStars.map((s) => copy.suspectStar(s)),
    ...v.suspectPalaces.map((s) => copy.suspectPalace(s)),
    ...v.suspectPlacements.map((s) => copy.suspectPlacement(s)),
  ];
}

function MessageMeta({ message }: { message: AskMessage }) {
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-ink-2">
      <span className={ASK_MARK_CLASS}>{copy.answerMarkGlyph}</span>
      <span>
        {new Date(message.at).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
      {message.cited && message.cited.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span>{copy.citedLabel}{message.cited.join('、')}</span>
        </>
      )}
      {message.model && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {message.model}
            {message.source === 'user' && copy.sourceUser}
            {message.source === 'builtin' && copy.sourceBuiltin}
          </span>
        </>
      )}
    </div>
  );
}

function MessageVerification({ suspects, isLatest }: { suspects: string[]; isLatest: boolean }) {
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];
  if (suspects.length > 0) {
    return (
      <div
        className="mt-4 rounded-lg border border-hua-ke/40 bg-surface-2 px-4 py-3"
        {...(isLatest ? { 'data-ask-verification': 'warn' } : {})}
        role="alert"
      >
        <p className="text-xs font-medium text-hua-ke">
          {copy.overreachNotice}
        </p>
        <ul className="mt-1.5 space-y-0.5 text-2xs text-ink-2">
          {suspects.map((s) => (
            <li key={s}>· {s}</li>
          ))}
        </ul>
      </div>
    );
  }
  // 自检通过时不打扰用户；保留 data 钩子供端到端校验
  return isLatest ? <span className="sr-only" data-ask-verification="clean" /> : null;
}

export default function AskPanel({
  year,
  month,
  day,
  hour,
  gender,
  available,
  providerConfigured = true,
  seed,
  quickPrompts,
  bare = false,
  subjectName,
  embedChart = false,
  chartHref,
  aiReady = true,
  onOpenConfig,
  sheetExtra,
}: AskPanelProps) {
  const identity = chartKey({ year, month, day, hour, gender });
  const {
    messages,
    append,
    threads,
    archived,
    trash,
    storageFull,
    activeId,
    newThread,
    selectThread,
    renameThread,
    setArchived,
    deleteThread,
    restoreThread,
    destroyThread,
    emptyTrash,
  } = useAskThread(identity);
  const [question, setQuestion] = useState('');
  /** 界面语言：界面骨架走 chatCopy；问句发给模型仍用中文（数据集是中文原文） */
  const [lang] = useLang();
  const copy = CHAT_COPY[lang];
  /** 推荐/意图芯片统一成 { label, question, dimension? } */
  const presets: AskQuickPrompt[] =
    quickPrompts ?? PRESETS.map((p) => ({ label: p, question: p }));
  const labelOf = (p: AskQuickPrompt) => (lang === 'en' && p.labelEn ? p.labelEn : p.label);
  /** 话题题名：建档用中文 label 作稳定键，展示时按语言取译名 */
  const topicTitle = (t: { title: string }) => {
    const hit = presets.find((x) => x.label === t.title);
    return hit ? labelOf(hit) : t.title;
  };
  const [transient, setTransient] = useState<Transient | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  /** 正在流式生成的回答（还没进线程）；thinking = 模型思考过程，只作等待期进度展示 */
  const [stream, setStream] = useState<{ question: string; text: string; thinking: string } | null>(null);

  // ── 长会话：渐进渲染 ──────────────────────────────────────
  /** 首屏只渲染最近 N 条，顶部「显示更早」按页往前翻（长会话不全量进 DOM） */
  const PAGE = 15;
  const [showCount, setShowCount] = useState(PAGE);
  // 换对话时回到只显示最近一页
  useEffect(() => {
    setShowCount(PAGE);
    setFoldedOpen(new Set());
  }, [activeId]);
  const earlierCount = Math.max(0, messages.length - showCount);
  const shownMessages = messages.slice(-showCount);
  /** 点「显示更早」时记住滚动位置，prepend 后还原（不然视线被顶飞） */
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const showEarlier = () => {
    const el = scrollRef.current;
    if (el) prependAnchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
    setShowCount((c) => c + PAGE);
  };
  useEffect(() => {
    const el = scrollRef.current;
    const anchor = prependAnchorRef.current;
    if (!el || !anchor) return;
    prependAnchorRef.current = null;
    el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
  }, [showCount]);

  /** 非最新的长回答默认折叠（>600 字）：长会话回看不用滚过所有长文 */
  const FOLD_CHARS = 600;
  const [foldedOpen, setFoldedOpen] = useState<Set<string>>(new Set());
  const toggleFold = (id: string) =>
    setFoldedOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** 「回到底部」：上翻超过一屏后浮出，流式期间不跟滚时尤其需要 */
  const [showJump, setShowJump] = useState(false);
  const jumpToBottom = () => {
    stickRef.current = true;
    setShowJump(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: preferredScrollBehavior() });
  };

  /** 删除对话后的撤销 toast（回收站里还有，一键恢复） */
  const [undoToast, setUndoToast] = useState<{ id: string; title: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!undoToast) return;
    undoTimerRef.current = setTimeout(() => setUndoToast(null), 5000);
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [undoToast]);

  /** 删除 = 进回收站 + 撤销提示（不再直接物理删除） */
  const handleDeleteThread = (id: string, title: string) => {
    deleteThread(id);
    setUndoToast({ id, title });
  };

  /** 用户点名切换一段旧对话 */
  const handleSelectThread = (id: string) => {
    selectThread(id);
  };
  /** 新对话：空白草稿，发第一条时落库 */
  const handleNewThread = () => {
    newThread();
  };
  const [expanded, setExpanded] = useState(true);
  /** 深度思考开关：发给 /api/ask 的 thinking 字段（DeepSeek 等支持思考的模型生效），记住选择 */
  const [deepThink, setDeepThink] = useState(true);
  useEffect(() => {
    if (window.localStorage.getItem('ziwei.deepThink') === '0') setDeepThink(false);
  }, []);
  const toggleDeepThink = () => {
    setDeepThink((v) => {
      window.localStorage.setItem('ziwei.deepThink', v ? '0' : '1');
      return !v;
    });
  };
  /** 下一条问题的页内焦点（维度/宫位），发出即清 */
  const [focus, setFocus] = useState<{ dimension?: string; palace?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const resultId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const consumedSeedRef = useRef<number | null>(null);
  /** 聊天滚动容器：流式输出时跟滚用 */
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 请求进行中的同步标记 —— 排队下一条用（pending 要等渲染才更新，靠不住） */
  const busyRef = useRef(false);
  /** 回答没结束时又发的问题：先排队，这条结束后自动发出（ref 存值防闭包旧值，state 只管显示） */
  const queuedRef = useRef<string | null>(null);
  const [queuedText, setQueuedText] = useState<string | null>(null);
  /** 对话内嵌盘：服务端算好后缓存，展开时渲染 */
  const [miniChart, setMiniChart] = useState<ChatChartPayload | null>(null);
  const [chartLayer, setChartLayer] = useState<'natal' | 'liunian'>('natal');
  /** 展开了迷你盘的消息 id */
  const [chartOpenFor, setChartOpenFor] = useState<string | null>(null);

  /** 对话抽屉：话题列表 / 新话题 / 档案 / AI 设置入口，都收在这里 */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 抽屉里「⋯」展开操作菜单的对话 id（一次只开一行） */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** 已归档 / 已删除两个折叠区的展开态 */
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const activeThread = threads.find((t) => t.id === activeId) ?? null;
  const headerTitle = activeThread ? topicTitle(activeThread) : copy.newChatTitle;


  // 输入框随内容长高（上限约 6 行，再多内部滚动），长问题也能一直看到自己正在打的字。
  // 多行时把胶囊圆角换成小圆角：9999px 大圆角在高的框上会把文字裁出弧形边缘。
  const [inputTall, setInputTall] = useState(false);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, 168);
    el.style.height = `${h}px`;
    const overflowing = el.scrollHeight > 168;
    el.style.overflowY = overflowing ? 'auto' : 'hidden';
    if (overflowing) el.scrollTop = el.scrollHeight;
    setInputTall(h > 64);
  }, [question, expanded]);

  useEffect(() => {
    function expandFromHash() {
      if (window.location.hash !== '#ask-panel') return;
      setExpanded(true);
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
    expandFromHash();
    window.addEventListener('hashchange', expandFromHash);
    return () => window.removeEventListener('hashchange', expandFromHash);
  }, []);

  // 对话内嵌盘：需要时才去服务端取（懒加载，不阻塞对话）
  useEffect(() => {
    if (!embedChart || miniChart) return;
    let cancelled = false;
    void getChatChart(year, month, day, hour, gender).then((c) => {
      if (!cancelled) setMiniChart(c);
    });
    return () => {
      cancelled = true;
    };
  }, [embedChart, miniChart, year, month, day, hour, gender]);

  // 页内追问种子：消费一次。带问题自动提交，否则只做焦点并聚焦输入框
  useEffect(() => {
    if (!seed || seed.id === consumedSeedRef.current) return;
    consumedSeedRef.current = seed.id;
    setExpanded(true);
    if (seed.dimension || seed.palace) {
      setFocus({ dimension: seed.dimension, palace: seed.palace });
    }
    if (seed.question) {
      submit(
        seed.question,
        seed.dimension || seed.time ? { dimension: seed.dimension, time: seed.time } : undefined,
      );
    } else {
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit 逐渲染闭包，只响应 seed 变化
  }, [seed]);

  // 新回答进线程后跟随：block: 'nearest' 只做最小滚动，不会把整页往下推
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      lastMessageRef.current?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'nearest',
      });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // 流式输出跟随滚动（粘底模式）：只要用户没有手动上翻，回答写到哪就跟到哪；
  // 一旦用户往上翻看历史就不再打扰，拉回底部后恢复跟随
  const stickRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - (el.scrollTop + el.clientHeight);
      stickRef.current = gap < 40;
      // 上翻超过约一屏：浮出「回到底部」
      setShowJump(gap > 240);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [bare, expanded]);

  // 流式输出时跟随滚动
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stream || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [stream]);

  /** 话题即对话：点话题芯片 = 切到（或新建）这个话题的专属对话再发问。
      例外：刚从「新对话」落到草稿态时，即使这个话题聊过也另起一条 —— 不然点了「新对话」
      又被拽回旧对话，等于没法开新对话。生成中的回答还在写旧话题时不切换，排队即可 */
  function submitInTopic(label: string, q: string, focus?: { dimension?: string; palace?: string; time?: 'liunian' | 'daxian' }) {
    if (busyRef.current) {
      submit(q, focus);
      return;
    }
    const draft = activeId === '__draft__';
    const existing = !draft ? threads.find((t) => t.title === label) : undefined;
    const inTopic = !draft && threads.some((t) => t.id === activeId && t.title === label);
    if (!inTopic) {
      if (existing) {
        handleSelectThread(existing.id);
      } else {
        handleNewThread();
      }
    }
    submit(q, focus, label);
  }

  function submit(
    q: string,
    chipFocus?: { dimension?: string; palace?: string; time?: 'liunian' | 'daxian' },
    topic?: string,
  ) {
    const text = q.trim();
    if (!text) return;

    // 回答还没结束时又点了发送 —— 排队，这条结束后自动发出（占位符承诺过"可以先把下一句打好"）
    if (busyRef.current) {
      if (!queuedRef.current) {
        queuedRef.current = text;
        setQueuedText(text);
        setQuestion('');
      }
      // 已有一条在排队 —— 输入框里新打的字保留，等这条结束再发
      return;
    }
    busyRef.current = true;
    stickRef.current = true; // 新问题从头跟滚

    setQuestion('');
    setTransient(null);
    setPendingQuestion(text);
    setExpanded(true);

    const fd = new FormData();
    fd.set('question', text);
    fd.set('year', String(year));
    fd.set('month', String(month));
    fd.set('day', String(day));
    fd.set('hour', String(hour));
    fd.set('gender', gender);
    // 用户自配 AI provider：随请求带给服务端临时构造（配置只在本机）
    const uai = readUserConfig();
    if (uai) {
      fd.set('ai_kind', uai.kind);
      if (uai.baseUrl) fd.set('ai_base_url', uai.baseUrl);
      fd.set('ai_key', uai.apiKey);
      fd.set('ai_model', uai.model);
      fd.set('ai_max_tokens', String(uai.maxTokens));
    }
    const effectiveFocus = chipFocus ?? focus;
    if (effectiveFocus?.dimension) fd.set('dimension', effectiveFocus.dimension);
    if (effectiveFocus?.palace) fd.set('palace', effectiveFocus.palace);
    if (chipFocus?.time) {
      fd.set('time', chipFocus.time);
      if (chipFocus.time === 'liunian') fd.set('targetYear', String(new Date().getFullYear()));
    }
    setFocus(null);
    fd.set(
      'turns',
      JSON.stringify(
        messages
          .slice(-CONTEXT_TURNS)
          .map((m) => ({ question: m.question, answer: m.answer })),
      ),
    );
    fd.set('thinking', deepThink ? 'enabled' : 'disabled');

    startTransition(async () => {
      try {
        await streamAsk(fd, {
          onDelta: (t) =>
            setStream((s) => ({
              question: text,
              text: (s?.text ?? '') + t,
              thinking: s?.thinking ?? '',
            })),
          onThinking: (t) =>
            setStream((s) => ({
              question: text,
              text: s?.text ?? '',
              thinking: (s?.thinking ?? '') + t,
            })),
          onDone: (p) => {
            // 空正文不落库（服务端已自动加重试，走到这里说明兜底也失效了）
            if (!p.answer.trim()) {
              setTransient({
                kind: 'error',
                message: copy.emptyAnswer,
                retryQuestion: text,
              });
              setStream(null);
              return;
            }
            append(
              {
                question: text,
                answer: p.answer,
                cited: p.cited,
                suspects: suspectsOf(p.verification, copy),
                ...(p.model ? { model: p.model } : {}),
                ...(p.source ? { source: p.source } : {}),
              },
              topic,
            );
            setStream(null);
          },
          onNotCovered: (message) => {
            setTransient({ kind: 'not-covered', message });
            setStream(null);
          },
          onError: (message) => {
            setTransient({ kind: 'error', message, retryQuestion: text });
            setStream(null);
          },
          onQuotaExceeded: (p) => {
            // 额度墙：不是普通报错 —— 说清为什么被墙 + 流量包入口 + 问卷入口
            setTransient({
              kind: 'quota-exceeded',
              message: p.message,
              limit: p.limit,
              loggedIn: p.loggedIn,
              packs: p.packEntry.packs,
              checkout: p.packEntry.checkout,
              survey: p.survey,
            });
            setStream(null);
          },
        });
      } catch {
        setTransient({
          kind: 'local-error',
          message: copy.requestFailed,
          retryQuestion: text,
        });
      } finally {
        setPendingQuestion(null);
        setStream(null);
        busyRef.current = false;
        // 有排队的下一条 —— 自动发出
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued) {
          setQueuedText(null);
          submit(queued);
        }
      }
    });
  }

  if (!available) return null;

  const latestId = messages.length > 0 ? messages[messages.length - 1].id : null;

  // 深度思考开关：低频设置，收在对话抽屉里
  const deepThinkChip = (
    <button
      type="button"
      onClick={toggleDeepThink}
      aria-pressed={deepThink}
      title={copy.deepThinkTitle}
      className="inline-flex items-center gap-1.5 text-2xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
    >
      {deepThink ? copy.deepThinkOn : copy.deepThinkOff}
    </button>
  );

  return (
    <div
      className={bare ? 'flex min-h-0 flex-1 flex-col print:hidden' : 'print:hidden'}
      id="ask-panel"
    >
      {!bare && (
      <div className="mb-5 border-b border-line pb-3">
        <h2>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="ask-panel-content"
            className="flex w-full items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zhu"
          >
            <span>
              <span className="block text-sm tracking-[0.2em] text-ink">
                {copy.askPanelTitle}
                {messages.length > 0 && (
                  <span className="ml-2 text-2xs font-normal tracking-normal text-ink-2">
                    {copy.savedChats(messages.length)}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-2xs font-normal text-ink-2">
                {copy.localOnly}
              </span>
            </span>
            <span className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-line px-3 py-1.5 text-2xs text-ink-2">
              {expanded ? copy.collapse : copy.expand}
            </span>
          </button>
        </h2>
        {!expanded && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xs font-medium text-ink-2">{copy.recommendedTitle}</span>
            {presets.slice(0, 2).map((p) => (
              <button
                key={p.question}
                type="button"
                onClick={() =>
                submit(
                  p.question,
                  p.dimension || p.time ? { dimension: p.dimension, time: p.time } : undefined,
                )
              }
                disabled={pending}
                className={CHIP_CLASS}
              >
                {labelOf(p)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                window.requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label={copy.moreAskAria}
              className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.moreRecommended}
            </button>
          </div>
        )}
      </div>
      )}

      <div
        id="ask-panel-content"
        hidden={!bare && !expanded}
        className={bare ? 'chat-stage relative flex min-h-0 flex-1 flex-col' : 'panel relative p-5 sm:p-6'}
      >
        {!providerConfigured && !bare && (
          <div
            className="mb-5 rounded-lg border border-lineSoft bg-surface-2 px-4 py-3"
            data-ask-provider="not-configured"
            role="status"
          >
            <p className="text-xs leading-relaxed text-ink-2">
              {copy.askUnavailable}
            </p>
          </div>
        )}

        {/* 本机存储写不进去：明示 + 指引清理（以前静默丢回答） */}
        {storageFull && (
          <div
            className="mb-3 rounded-lg border border-lineSoft bg-surface-2 px-4 py-3"
            role="alert"
          >
            <p className="text-xs leading-relaxed text-danger">{copy.storageFull}</p>
          </div>
        )}

        {/* 会话头：整页唯一钉住的行 —— 标题点开对话抽屉，右侧命盘 + AI 设置 */}
        {bare && (
          <div className="relative mb-1 flex shrink-0 items-center gap-2.5 pb-1.5">
            <button
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-expanded={sheetOpen}
              className="group flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
            >
              <span className="min-w-0 truncate font-serif text-[0.95rem] text-ink">{headerTitle}</span>
              {subjectName && (
                <span className="min-w-0 shrink text-xs text-ink-2">· {subjectName}</span>
              )}
              <span aria-hidden="true" className="shrink-0 text-2xs text-ink-3">⌄</span>
            </button>
            {chartHref && (
              <Link
                href={chartHref}
                className="shrink-0 text-xs text-zhu underline underline-offset-2 transition-colors hover:text-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {copy.chartLink}
              </Link>
            )}
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                aria-label={copy.aiSettings}
                title={copy.openAiSettingsTitle}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-sm leading-none text-ink-2 transition-colors hover:border-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                ⚙
                {!aiReady && (
                  <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-danger" />
                )}
              </button>
            )}

            {/* 对话抽屉：话题列表 / 新话题 / 宿主页内容（档案、AI 状态）。
                手机端贴底滑出，桌面端挂在标题下方 */}
            {sheetOpen && (
              <>
                <button
                  type="button"
                  aria-label={copy.closeSheetAria}
                  onClick={() => setSheetOpen(false)}
                  className="fixed inset-0 z-20 cursor-default bg-ink/25"
                />
                <div
                  role="dialog"
                  aria-label={copy.manageAria}
                  className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[72dvh] overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-[0_12px_40px_rgba(28,35,51,0.18)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(env(safe-area-inset-bottom),12px)]"
                >
                  {/* ① 对话：当前盘下的所有话题 */}
                  <section aria-label={copy.conversationsOf()}>
                    <p className="mb-1 px-1 text-2xs text-ink-3">{copy.conversationsOf(subjectName)}</p>
                    {threads.length === 0 ? (
                      <p className="px-1 text-2xs leading-relaxed text-ink-3">
                        {copy.noConversationsHint}
                      </p>
                    ) : (
                      <ul>
                        {threads.map((t) => {
                          const isActive = t.id === activeId;
                          return (
                            <li key={t.id}>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectThread(t.id);
                                    setSheetOpen(false);
                                  }}
                                  aria-current={isActive || undefined}
                                  className={`flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                                    isActive
                                      ? 'bg-zhu-soft text-ink'
                                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                  }`}
                                >
                                  <span className="min-w-0 flex-1 truncate font-serif text-sm">{topicTitle(t)}</span>
                                  <span className="shrink-0 text-2xs text-ink-3">
                                    {relDay(t.updatedAt, copy)} · {copy.msgCount(t.messages.length)}
                                  </span>
                                </button>
                                {/* 「⋯」操作菜单：重命名 / 归档 / 删除收进二级，不再给误触留机会 */}
                                <button
                                  type="button"
                                  aria-label={`${copy.threadActions}：${topicTitle(t)}`}
                                  aria-expanded={menuFor === t.id}
                                  onClick={() => setMenuFor((cur) => (cur === t.id ? null : t.id))}
                                  className="shrink-0 self-center rounded-full px-2 py-1.5 text-2xs text-ink-3/70 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                >
                                  ⋯
                                </button>
                              </div>
                              {menuFor === t.id && (
                                <div className="mx-2 mb-1 flex gap-1 rounded-lg border border-lineSoft bg-paper/60 px-2 py-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = window.prompt(copy.renameThreadPrompt, topicTitle(t));
                                      if (next !== null) renameThread(t.id, next);
                                      setMenuFor(null);
                                    }}
                                    className="rounded-md px-2.5 py-1.5 text-2xs text-ink-2 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                  >
                                    {copy.renameThread}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setArchived(t.id, true);
                                      setMenuFor(null);
                                    }}
                                    className="rounded-md px-2.5 py-1.5 text-2xs text-ink-2 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                  >
                                    {copy.archiveThread}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleDeleteThread(t.id, topicTitle(t));
                                      setMenuFor(null);
                                    }}
                                    className="rounded-md px-2.5 py-1.5 text-2xs text-danger/80 transition-colors hover:bg-surface hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                  >
                                    {copy.deleteThread}
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* 已归档：不删数据，只是不占主列表；随时恢复 */}
                    {archived.length > 0 && (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setArchivedOpen((v) => !v)}
                          aria-expanded={archivedOpen}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-2xs text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                        >
                          <span>{copy.archivedSection(archived.length)}</span>
                          <span aria-hidden="true" className={`transition-transform ${archivedOpen ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                        {archivedOpen && (
                          <ul>
                            {archived.map((t) => (
                              <li key={t.id} className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setArchived(t.id, false)}
                                  title={copy.unarchiveThread}
                                  className="flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                                >
                                  <span className="min-w-0 flex-1 truncate font-serif text-sm">{topicTitle(t)}</span>
                                  <span className="shrink-0 text-2xs text-ink-3">
                                    {relDay(t.updatedAt, copy)} · {copy.msgCount(t.messages.length)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  aria-label={`${copy.unarchiveThread}：${topicTitle(t)}`}
                                  onClick={() => setArchived(t.id, false)}
                                  className="shrink-0 self-center rounded-full px-2 py-1.5 text-2xs text-ink-3/70 transition-colors hover:bg-surface-2 hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                >
                                  {copy.restoreThread}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* 已删除（回收站）：30 天内可恢复，也可彻底删 */}
                    {trash.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setTrashOpen((v) => !v)}
                            aria-expanded={trashOpen}
                            className="flex flex-1 items-center justify-between rounded-lg px-2.5 py-1.5 text-2xs text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                          >
                            <span>{copy.trashSection(trash.length)}</span>
                            <span aria-hidden="true" className={`transition-transform ${trashOpen ? 'rotate-180' : ''}`}>▾</span>
                          </button>
                          {trashOpen && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(copy.emptyTrashConfirm)) emptyTrash();
                              }}
                              className="shrink-0 rounded-lg px-2 py-1.5 text-2xs text-danger/80 transition-colors hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                            >
                              {copy.emptyTrash}
                            </button>
                          )}
                        </div>
                        {trashOpen && (
                          <ul>
                            {trash.map((t) => (
                              <li key={t.id} className="flex items-center gap-0.5">
                                <span className="min-w-0 flex-1 truncate px-2.5 py-2 font-serif text-sm text-ink-3">
                                  {topicTitle(t)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => restoreThread(t.id)}
                                  className="shrink-0 self-center rounded-full px-2 py-1.5 text-2xs text-ink-3/70 transition-colors hover:bg-surface-2 hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                >
                                  {copy.restoreThread}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => destroyThread(t.id)}
                                  className="shrink-0 self-center rounded-full px-2 py-1.5 text-2xs text-danger/70 transition-colors hover:bg-surface-2 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                                >
                                  {copy.destroyThread}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </section>

                  {/* ② 开个新话题：话题芯片在空态卡片里已有，这里只给一个干净的入口 */}
                  <section aria-label={copy.newTopic} className="mt-3 border-t border-lineSoft pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        handleNewThread();
                        setSheetOpen(false);
                        window.requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      disabled={pending}
                      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5 text-left text-xs text-ink-2 transition-colors hover:border-zhu hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span aria-hidden="true">＋</span>
                      {copy.newChatTitle}
                    </button>
                  </section>

                  {/* ③ 当前这张盘：档案信息（宿主页提供） */}
                  {sheetExtra && (
                    <section aria-label={copy.currentChart} className="mt-3 border-t border-lineSoft pt-3">
                      <p className="mb-1 px-1 text-2xs text-ink-3">{copy.currentChart}</p>
                      {sheetExtra}
                    </section>
                  )}

                  {/* ④ 当前对话的次要操作 */}
                  <section className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-lineSoft pt-3">
                    {deepThinkChip}
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {/* 对话线程 */}
        <div
          id={resultId}
          ref={bare ? scrollRef : undefined}
          aria-live="polite"
          aria-busy={pending}
          className={bare ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : undefined}
        >
          {/* 空态引导卡片只属于「全新对话」：历史折叠后 visibleMessages 也是空，
              但那是聊天记录被收起来，不是没聊过 —— 再渲染引导卡会和折叠条打架 */}
          {messages.length === 0 && !pending && !transient && bare && (
            /* 空态就是「引导」：不给一排灰字链接，直接给几张能点的卡片 ——
               没人会主动提问，就让人点一下就有回答 */
            <div className="flex flex-1 flex-col justify-center gap-4" role="status">
              <div className="text-center">
                <p aria-hidden="true" className="mb-1.5 font-serif text-lg text-zhu/70">
                  ✦
                </p>
                <p className="font-serif text-[1.15rem] text-ink">{copy.emptyTitle(subjectName)}</p>
                <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-ink-2">
                  {copy.emptySub}
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {presets
                  .filter((p) => p.featured)
                  .map((p) => (
                    <button
                      key={p.question}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        submitInTopic(
                          p.label,
                          p.question,
                          p.dimension || p.time
                            ? { dimension: p.dimension, time: p.time }
                            : undefined,
                        )
                      }
                      className="flex flex-col items-start gap-0.5 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-all hover:border-zhu hover:shadow-[0_2px_10px_rgba(28,35,51,0.06)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-ink">{labelOf(p)}</span>
                      <span className="text-2xs text-ink-2">
                        {lang === 'en' && p.hintEn ? p.hintEn : p.hint}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
          {messages.length === 0 && !pending && !transient && !bare && (
            <div role="status">
              <p className="text-xs leading-relaxed text-ink-2">
                {copy.askAround}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {presets.slice(0, 2).map((p) => (
                  <button
                    key={p.question}
                    type="button"
                    onClick={() =>
                submit(
                  p.question,
                  p.dimension || p.time ? { dimension: p.dimension, time: p.time } : undefined,
                )
              }
                    disabled={pending}
                    className={CHIP_CLASS}
                  >
                    {labelOf(p)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* mt-auto：内容少时把对话压到输入框上方（贴底），内容多了照常内部滚动 */}
          <div className={bare ? 'mt-auto space-y-5' : 'space-y-5'}>
            {/* 话题题头：像签纸一样安静地标注这段对话是谁 */}
            {bare && activeThread && shownMessages.length > 0 && (
              <p className="pb-1 text-center font-serif text-2xs tracking-[0.25em] text-ink-3">
                {topicTitle(activeThread)}
                <span className="mx-1.5 tracking-normal">·</span>
                {copy.captionStarted}{' '}
                {new Date(activeThread.createdAt).toLocaleDateString(
                  lang === 'en' ? 'en-US' : 'zh-CN',
                  { month: 'long', day: 'numeric' },
                )}
              </p>
            )}
            {messages.length >= MAX_MESSAGES && (
              <p className="rounded-lg border border-lineSoft bg-surface/70 px-3 py-2 text-2xs leading-relaxed text-ink-3">
                {copy.maxNotice(MAX_MESSAGES)}
              </p>
            )}
            {/* 长会话：更早的消息按页往前翻，不全量进 DOM */}
            {earlierCount > 0 && (
              <p className="text-center">
                <button
                  type="button"
                  onClick={showEarlier}
                  className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-4 py-1.5 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  {copy.showEarlier(Math.min(PAGE, earlierCount))}
                </button>
              </p>
            )}
            {shownMessages.map((m, mi) => {
              const isLatest = m.id === latestId;
              /* 跨天分隔：与上一条（已显示的）不在同一天时插一条日期线 */
              const prevAt = mi > 0 ? shownMessages[mi - 1].at : null;
              const msgDay = new Date(m.at).toDateString();
              const daySep =
                prevAt === null || new Date(prevAt).toDateString() !== msgDay
                  ? daySepLabel(m.at, lang, copy)
                  : null;
              /* 非最新的长回答默认折叠 */
              const foldable = !isLatest && m.answer.length > FOLD_CHARS;
              const folded = foldable && !foldedOpen.has(m.id);
              const foldToggle = foldable ? (
                <button
                  type="button"
                  onClick={() => toggleFold(m.id)}
                  className="mt-1.5 text-2xs text-ink-2 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  {folded ? copy.expandAnswer : copy.collapseAnswer}
                </button>
              ) : null;
              const sepEl = daySep ? (
                <p
                  key={`sep-${m.id}`}
                  className="pt-2 text-center text-2xs tracking-wide2 text-ink-3"
                  aria-hidden="true"
                >
                  — {daySep} —
                </p>
              ) : null;
              if (bare) {
                return (
                  <Fragment key={m.id}>
                    {sepEl}
                    <div
                      ref={isLatest ? lastMessageRef : undefined}
                      className="space-y-1.5"
                      {...(isLatest ? { 'data-ask-state': 'ok' } : {})}
                    >
                    <p className="text-right">
                      <span className="inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-[linear-gradient(180deg,rgba(61,90,133,0.97),rgba(61,90,133,0.86))] px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-white shadow-[0_2px_10px_rgba(61,90,133,0.16)]">
                        {m.question}
                      </span>
                    </p>
                    <div className="max-w-[95%]">
                      <AnswerAvatar cited={m.cited} model={m.model} source={m.source} />
                      <div className={folded ? 'relative max-h-44 overflow-hidden' : undefined}>
                        <div
                          className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-3 font-serif text-[15px] leading-[1.9] text-ink shadow-[0_1px_4px_rgba(28,35,51,0.04)] [&_p:first-of-type]:mt-0 [&_p:last-of-type]:mb-0"
                          data-ask-answer=""
                        >
                          <Markdown text={m.answer} />
                        </div>
                        {folded && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface-2 to-transparent"
                          />
                        )}
                      </div>
                      {foldToggle}
                    </div>
                    <MessageVerification suspects={m.suspects} isLatest={isLatest} />
                    {embedChart && miniChart && (
                      chartOpenFor === m.id ? (
                        <div>
                          <MiniChart chart={miniChart} layer={chartLayer} onLayerChange={setChartLayer} />
                          <button
                            type="button"
                            onClick={() => setChartOpenFor(null)}
                            className="mt-1.5 text-2xs text-ink-2 underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                          >
                            {copy.collapseChart}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setChartOpenFor(m.id);
                            setChartLayer('natal');
                          }}
                          className="text-2xs text-ink-2 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                        >
                          {copy.viewChartInChat}
                        </button>
                      )
                    )}
                    </div>
                  </Fragment>
                );
              }
              return (
                <Fragment key={m.id}>
                  {sepEl}
                  <div
                    ref={isLatest ? lastMessageRef : undefined}
                    className="rounded-xl border border-line bg-surface-2 px-4 py-4"
                    {...(isLatest ? { 'data-ask-state': 'ok' } : {})}
                  >
                  <p className="text-xs font-medium text-ink">
                    <span className={ASK_MARK_CLASS}>问</span>
                    {m.question}
                  </p>
                  <div className="mt-3 border-t border-lineSoft pt-3">
                    <MessageMeta message={m} />
                    <div className={folded ? 'relative max-h-44 overflow-hidden' : undefined}>
                      <div
                        className="text-sm leading-[1.95] text-ink-2 [&_p:first-of-type]:mt-0"
                        data-ask-answer=""
                      >
                        <Markdown text={m.answer} />
                      </div>
                      {folded && (
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface-2 to-transparent"
                        />
                      )}
                    </div>
                    {foldToggle}
                    <MessageVerification suspects={m.suspects} isLatest={isLatest} />

                    {/* 对话内嵌盘：回答后就地展开，不跳走 */}
                    {embedChart && miniChart && (
                      <div className="mt-3 border-t border-lineSoft pt-3">
                        {chartOpenFor === m.id ? (
                          <>
                            <MiniChart
                              chart={miniChart}
                              layer={chartLayer}
                              onLayerChange={setChartLayer}
                            />
                            <button
                              type="button"
                              onClick={() => setChartOpenFor(null)}
                              className="mt-2 inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-2.5 py-1 text-2xs leading-none text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                            >
                              {copy.collapseChart}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setChartOpenFor(m.id);
                              setChartLayer('natal');
                            }}
                            className="inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-2.5 py-1 text-2xs leading-none text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                          >
                            {copy.viewChartInChat}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                </Fragment>
              );
            })}
          </div>

          {pending && pendingQuestion && (bare ? (
            <div
              className="chart-submit mt-4 space-y-1.5"
              style={motionStyle(DURATION.sanfang)}
              role="status"
            >
              <span className="sr-only">{copy.verifying}</span>
              <p className="text-right">
                <span className="inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-[linear-gradient(180deg,rgba(61,90,133,0.97),rgba(61,90,133,0.86))] px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-white shadow-[0_2px_10px_rgba(61,90,133,0.16)]">
                  {pendingQuestion}
                </span>
              </p>
              <div>
                <AnswerAvatar />
                {stream?.text ? (
                  /* 流式：模型吐一个字就显示一个字 */
                  <div className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-3 font-serif text-[15px] leading-[1.9] text-ink shadow-[0_1px_4px_rgba(28,35,51,0.04)] [&_p:first-of-type]:mt-0 [&_p:last-of-type]:mb-0">
                    <Markdown text={stream.text} />
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-zhu motion-reduce:animate-none"
                    />
                  </div>
                ) : stream?.thinking ? (
                  /* 思考期：把思维链实时显示出来 —— 6–8 秒的空白等待变成看得见的进度 */
                  <ThinkingBlock text={stream.thinking} note={copy.thinkingNote} />
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 motion-reduce:animate-none" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:150ms] motion-reduce:animate-none" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:300ms] motion-reduce:animate-none" />
                    {/* 模型在思考时并没有字可吐，明确说清楚在干嘛 */}
                    <span className="text-xs text-ink-2">{copy.thinking}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="chart-submit mt-5 rounded-xl border border-line bg-surface-2 px-4 py-4"
              style={motionStyle(DURATION.sanfang)}
              role="status"
            >
              <p className="text-xs font-medium text-ink">
                <span className={ASK_MARK_CLASS}>问</span>
                {pendingQuestion}
              </p>
              <div className="mt-3 border-t border-lineSoft pt-3">
                {stream?.text ? (
                  <div className="text-sm leading-[1.95] text-ink-2 [&_p:first-of-type]:mt-0">
                    <Markdown text={stream.text} />
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-zhu motion-reduce:animate-none"
                    />
                  </div>
                ) : stream?.thinking ? (
                  <ThinkingBlock text={stream.thinking} note={copy.thinkingNote} />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-zhu motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-ink-2">{copy.searching}</p>
                    </div>
                    <p className="mt-1.5 text-2xs text-ink-2">
                      {copy.verifyingIntro}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}

          {transient && (
            transient.kind === 'quota-exceeded' ? (
              <div className="mt-5">
                <QuotaWall
                  limit={transient.limit}
                  packs={transient.packs}
                  checkout={transient.checkout}
                  loggedIn={transient.loggedIn}
                  survey={transient.survey}
                />
              </div>
            ) : (
              <div
                className="mt-5 rounded-lg border border-lineSoft bg-surface-2 px-4 py-3"
                data-ask-state={transient.kind === 'local-error' ? 'error' : transient.kind}
                role={transient.kind === 'local-error' || transient.kind === 'error' ? 'alert' : 'status'}
              >
                <p className="text-xs leading-relaxed text-ink-2">{transient.message}</p>
                {(transient.kind === 'local-error' || transient.kind === 'error') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => submit(transient.retryQuestion)}
                      disabled={pending}
                      className="rounded-lg border border-zhu/25 bg-surface px-3 py-2 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                    >
                      {copy.retry}
                    </button>
                    {/* 服务端报错（内置 AI 限流/故障）：给一条不用等的活路 —— 配自己的 Key */}
                    {transient.kind === 'error' && onOpenConfig && (
                      <button
                        type="button"
                        onClick={onOpenConfig}
                        className="rounded-lg bg-zhu px-3 py-2 text-xs text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        {copy.errorConfigCta}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* 回到底部：上翻超过一屏后浮出；流式期间不跟滚时尤其需要 */}
        {bare && showJump && (
          <button
            type="button"
            onClick={jumpToBottom}
            aria-label={copy.backToBottom}
            title={copy.backToBottom}
            className="absolute bottom-24 right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-sm text-ink-2 shadow-[0_6px_18px_rgba(28,35,51,0.16)] transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            ↓
          </button>
        )}

        {/* 删除对话的撤销条：回收站里还有，一键恢复 */}
        {undoToast && (
          <div
            role="status"
            className="pointer-events-auto absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 text-xs text-paper shadow-[0_8px_24px_rgba(36,33,29,0.3)]"
          >
            <span className="max-w-48 truncate">{copy.deletedToast(undoToast.title)}</span>
            <button
              type="button"
              onClick={() => {
                restoreThread(undoToast.id);
                setUndoToast(null);
              }}
              className="shrink-0 font-medium text-white underline underline-offset-2 transition-colors hover:text-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {copy.undo}
            </button>
          </div>
        )}

        {/* 输入区：bare = 聊天式胶囊输入（Enter 发送），非 bare = 表单式 */}
        {bare ? (
          <div className="mt-4 shrink-0 border-t border-lineSoft pt-3 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                id="ask-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(question);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder={pending ? copy.placeholderPending : copy.placeholderIdle}
                className={`chat-input flex-1 ${inputTall ? '!rounded-2xl' : ''}`}
              />
              <button
                type="button"
                onClick={() => submit(question)}
                disabled={!question.trim()}
                aria-label={pending ? copy.sendQueueTitle : copy.send}
                title={pending ? copy.sendQueueTitle : copy.send}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zhu text-white shadow-[0_6px_16px_rgba(61,90,133,0.28)] transition-colors hover:bg-zhu-deep disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {pending ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  '↑'
                )}
              </button>
            </div>
            {queuedText && (
              <p className="mt-1.5 text-2xs text-zhu" role="status">
                {copy.queued(queuedText)}
              </p>
            )}
          </div>
        ) : (
        <>
        <div className="mt-6 border-t border-line pt-5">
          <label htmlFor="ask-question" className="field-label">
            {copy.yourQuestion}
          </label>
          <textarea
            ref={textareaRef}
            id="ask-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(question);
              }
            }}
            rows={3}
            maxLength={2000}
            placeholder={
              pending
                ? copy.placeholderPending
                : messages.length > 0
                  ? copy.placeholderContinue
                  : copy.exampleCareer
            }
            className="field-input resize-y leading-relaxed"
            aria-describedby="ask-submit-hint"
          />

          {/* 空态里已有 2 枚推荐 chip，有对话后才在这里再列全部推荐，避免重复 */}
          {messages.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.question}
                  type="button"
                  onClick={() =>
                submit(
                  p.question,
                  p.dimension || p.time ? { dimension: p.dimension, time: p.time } : undefined,
                )
              }
                  disabled={pending}
                  className={CHIP_CLASS}
                >
                  {labelOf(p)}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleDeepThink}
              aria-pressed={deepThink}
              title={copy.deepThinkTitle}
              className={
                CHIP_CLASS +
                (deepThink ? ' border-zhu/50 text-ink' : ' border-line text-ink-2 opacity-70')
              }
            >
              {deepThink ? copy.deepThinkOn : copy.deepThinkOff}
            </button>
          </div>

          <button
            type="button"
            onClick={() => submit(question)}
            disabled={pending || !question.trim()}
            aria-busy={pending || undefined}
            aria-describedby="ask-submit-hint"
            className="btn-primary mt-4 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            {pending ? copy.verifying : copy.followUp}
          </button>
          <p id="ask-submit-hint" className="mt-2 text-2xs text-ink-2">
            {pending
              ? copy.hintVerifying
              : messages.length > 0
                ? copy.hintContinue
                : copy.hintFirst}
          </p>
        </div>

        {messages.length > 0 && (
          <div className="mt-4 flex justify-end border-t border-lineSoft pt-3">
            <button
              type="button"
              onClick={() => {
                if (activeThread) handleDeleteThread(activeThread.id, topicTitle(activeThread));
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-2 transition-colors hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.nonBareDelete}
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {!bare && (
        <p className="mt-3 text-2xs leading-relaxed text-ink-2">
          {copy.disclaimerShort}
        </p>
      )}
    </div>
  );
}
