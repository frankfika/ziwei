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

import { useEffect, useId, useRef, useState, useTransition } from 'react';
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
  question: string;
  dimension?: string;
  /** 时间层焦点：流年（今年）/ 大限（这十年） */
  time?: 'liunian' | 'daxian';
  /** 空态大卡片用的一句话说明（比 question 短） */
  hint?: string;
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
  return (
    <p className="mb-1 flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zhu text-[10px] leading-none text-white">
        紫
      </span>
      <span className="text-2xs font-medium text-ink-2">紫微</span>
      {model && (
        <span className="text-2xs text-ink-2">
          · {model}
          {source === 'user' && '（你的 Key）'}
          {source === 'builtin' && '（内置免费）'}
        </span>
      )}
      {cited && cited.length > 0 && (
        <span className="text-2xs text-ink-2">· 参 {cited.join('、')}</span>
      )}
    </p>
  );
}

/** 「正在思考」的实时思维链：只用于等待期进度展示，正文开始流出后让位，不进线程、不持久化 */
function ThinkingBlock({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [text]);
  return (
    <div className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-2.5" role="status">
      <p className="mb-1 flex items-center gap-1.5 text-2xs text-ink-3">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zhu/70 motion-reduce:animate-none" aria-hidden="true" />
        正在思考…（过程仅作参考，以最终回答为准）
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
    };

function suspectsOf(v: AskStreamVerification): string[] {
  return [
    ...v.suspectStars.map((s) => `星曜「${s}」`),
    ...v.suspectPalaces.map((s) => `宫位「${s}」`),
    ...v.suspectPlacements.map((s) => `落宫「${s}」`),
  ];
}

function MessageMeta({ message }: { message: AskMessage }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-ink-2">
      <span className={ASK_MARK_CLASS}>答</span>
      <span>
        {new Date(message.at).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
      {message.cited && message.cited.length > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span>依据：{message.cited.join('、')}</span>
        </>
      )}
      {message.model && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {message.model}
            {message.source === 'user' && '（你的 Key）'}
            {message.source === 'builtin' && '（内置免费）'}
          </span>
        </>
      )}
    </div>
  );
}

function MessageVerification({ suspects, isLatest }: { suspects: string[]; isLatest: boolean }) {
  if (suspects.length > 0) {
    return (
      <div
        className="mt-4 rounded-lg border border-hua-ke/40 bg-surface-2 px-4 py-3"
        {...(isLatest ? { 'data-ask-verification': 'warn' } : {})}
        role="alert"
      >
        <p className="text-xs font-medium text-hua-ke">
          这条回答里有些说法超出了你的盘面材料，请谨慎参考：
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
}: AskPanelProps) {
  const identity = chartKey({ year, month, day, hour, gender });
  const {
    messages,
    loaded,
    append,
    clear,
    threads,
    archivedThreads,
    activeId,
    newThread,
    selectThread,
    archiveThread,
    unarchiveThread,
  } = useAskThread(identity);
  const [question, setQuestion] = useState('');
  const [transient, setTransient] = useState<Transient | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  /** 正在流式生成的回答（还没进线程）；thinking = 模型思考过程，只作等待期进度展示 */
  const [stream, setStream] = useState<{ question: string; text: string; thinking: string } | null>(null);
  /** 挂载时已存在的消息 id（=「上次留下的」，默认折叠）；按 id 记，对话满额截断后新问答也不会被误藏 */
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const messagesRef = useRef<AskMessage[]>([]);
  messagesRef.current = messages;
  const activeIdRef = useRef<string | null>(null);
  // 初次加载 & 身份变化：把现有消息记作「历史」并折叠
  useEffect(() => {
    if (!loaded) return;
    const cur = activeId ?? null;
    if (activeIdRef.current !== cur) {
      activeIdRef.current = cur;
      setSeenIds(messagesRef.current.map((m) => m.id));
      setShowHistory(false);
    }
  }, [loaded, activeId]);
  /** 没展开历史时，只渲染本次新增的消息 */
  const visibleMessages = showHistory
    ? messages
    : messages.filter((m) => !seenIds.includes(m.id));
  /** 折叠条上「上次这段对话有 N 条」：仍留存的旧消息数（满额截断后会随之减少） */
  const historyCount = messages.filter((m) => seenIds.includes(m.id)).length;

  /** 用户点名切换一段旧对话 → 直接展开（人家就是要看它的） */
  const handleSelectThread = (id: string) => {
    activeIdRef.current = id; // 抢先同步 ref，上面的 effect 不再覆盖展开状态
    selectThread(id);
    const t = threads.find((x) => x.id === id);
    setSeenIds(t?.messages.map((m) => m.id) ?? []);
    setShowHistory(true);
  };
  /** 新对话：空白草稿，发第一条时落库 */
  const handleNewThread = () => {
    activeIdRef.current = '__draft__';
    newThread();
    setSeenIds([]);
    setShowHistory(false);
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

  /** 推荐/意图芯片统一成 { label, question, dimension? } */
  const presets: AskQuickPrompt[] =
    quickPrompts ?? PRESETS.map((p) => ({ label: p, question: p }));

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
      stickRef.current = el.scrollHeight - (el.scrollTop + el.clientHeight) < 40;
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

  function submit(
    q: string,
    chipFocus?: { dimension?: string; palace?: string; time?: 'liunian' | 'daxian' },
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
        visibleMessages
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
                message: '模型这次没有产出正文。可以直接点重试，或换一个不带思考的模型。',
                retryQuestion: text,
              });
              setStream(null);
              return;
            }
            append({
              question: text,
              answer: p.answer,
              cited: p.cited,
              suspects: suspectsOf(p.verification),
              ...(p.model ? { model: p.model } : {}),
              ...(p.source ? { source: p.source } : {}),
            });
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
            // 额度墙：不是普通报错 —— 说清为什么被墙 + 流量包入口
            setTransient({
              kind: 'quota-exceeded',
              message: p.message,
              limit: p.limit,
              loggedIn: p.loggedIn,
              packs: p.packEntry.packs,
              checkout: p.packEntry.checkout,
            });
            setStream(null);
          },
        });
      } catch {
        setTransient({
          kind: 'local-error',
          message: '追问请求失败，可能是网络波动或服务暂时不可用。请稍后重试。',
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
                命盘追问
                {messages.length > 0 && (
                  <span className="ml-2 text-2xs font-normal tracking-normal text-ink-2">
                    已存 {messages.length} 条对话
                  </span>
                )}
              </span>
              <span className="mt-1 block text-2xs font-normal text-ink-2">
                对话只存在本机
              </span>
            </span>
            <span className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-line px-3 py-1.5 text-2xs text-ink-2">
              {expanded ? '收起' : '展开'}
            </span>
          </button>
        </h2>
        {!expanded && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-2xs font-medium text-ink-2">推荐追问：</span>
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
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                window.requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label="展开更多推荐追问"
              className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              更多推荐
            </button>
          </div>
        )}
      </div>
      )}

      <div
        id="ask-panel-content"
        hidden={!bare && !expanded}
        className={bare ? 'flex min-h-0 flex-1 flex-col' : 'panel p-5 sm:p-6'}
      >
        {!providerConfigured && !bare && (
          <div
            className="mb-5 rounded-lg border border-lineSoft bg-surface-2 px-4 py-3"
            data-ask-provider="not-configured"
            role="status"
          >
            <p className="text-xs leading-relaxed text-ink-2">
              智能追问暂未开启。排盘与解读不受影响，可以照常查看。
            </p>
          </div>
        )}

        {/* 对话切换：这张盘下的全部对话，随时切回去/开新的 —— 新开一段不再「找不到旧的」 */}
        {bare && loaded && threads.length + archivedThreads.length > 0 && (
          <div className="mb-3 flex shrink-0 items-center gap-2">
            <label htmlFor="ask-thread-select" className="shrink-0 text-2xs text-ink-2">
              对话记录
            </label>
            <select
              id="ask-thread-select"
              value={threads.some((t) => t.id === activeId) ? activeId! : '__draft__'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '__draft__') handleNewThread();
                else {
                  // 选中已归档的对话 = 恢复它
                  if (archivedThreads.some((t) => t.id === v)) unarchiveThread(v);
                  handleSelectThread(v);
                }
              }}
              className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-2.5 py-1.5 text-2xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {!threads.some((t) => t.id === activeId) && (
                <option value="__draft__">（这次对话）</option>
              )}
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ·{' '}
                  {new Date(t.updatedAt).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </option>
              ))}
              {archivedThreads.length > 0 && (
                <optgroup label="已归档（选中即恢复）">
                  {archivedThreads.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ·{' '}
                      {new Date(t.updatedAt).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              onClick={handleNewThread}
              className="shrink-0 rounded-lg border border-zhu/30 bg-surface px-2.5 py-1.5 text-2xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              ＋新对话
            </button>
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
            <div className="flex flex-1 flex-col justify-center gap-3" role="status">
              <div>
                <p className="text-[1.05rem] font-medium text-ink">
                  {subjectName ? `想问问 ${subjectName} 这张盘什么？` : '想问问这张盘什么？'}
                </p>
                <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-ink-2">
                  回答只依据这张盘的数据集原文 —— 材料里没写的，它会直说没有；对话只存在本机浏览器。
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
                        submit(
                          p.question,
                          p.dimension || p.time
                            ? { dimension: p.dimension, time: p.time }
                            : undefined,
                        )
                      }
                      className="flex flex-col items-start gap-0.5 rounded-xl border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-sm font-medium text-ink">{p.label}</span>
                      <span className="text-2xs text-ink-2">{p.hint}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
          {messages.length === 0 && !pending && !transient && !bare && (
            <div role="status">
              <p className="text-xs leading-relaxed text-ink-2">
                围绕这张盘提问，回答只依据数据集原文。
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
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 上次的对话：默认折叠成一行，不点开就不占屏 */}
          {bare && historyCount > 0 && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-lineSoft bg-surface/70 px-3 py-2">
              <p className="min-w-0 truncate text-xs text-ink-2">
                上次这段对话有 {historyCount} 条
                {!showHistory && ' · 没展开，不算这次对话的上下文'}
              </p>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 transition-colors hover:border-zhu hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {showHistory ? '收起' : '展开'}
              </button>
            </div>
          )}

          {/* mt-auto：内容少时把对话压到输入框上方（贴底），内容多了照常内部滚动 */}
          <div className={bare ? 'mt-auto space-y-4' : 'space-y-5'}>
            {messages.length >= MAX_MESSAGES && (
              <p className="rounded-lg border border-lineSoft bg-surface/70 px-3 py-2 text-2xs leading-relaxed text-ink-3">
                这段对话只保留最近 {MAX_MESSAGES} 条，再往下问会挤掉最前面的 —— 想留档请另开一段新对话。
              </p>
            )}
            {visibleMessages.map((m) => {
              const isLatest = m.id === latestId;
              if (bare) {
                return (
                  <div
                    key={m.id}
                    ref={isLatest ? lastMessageRef : undefined}
                    className="space-y-1.5"
                    {...(isLatest ? { 'data-ask-state': 'ok' } : {})}
                  >
                    <p className="text-right">
                      <span className="inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-zhu px-3.5 py-2 text-left text-xs leading-relaxed text-white">
                        {m.question}
                      </span>
                    </p>
                    <div className="max-w-[95%]">
                      <AnswerAvatar cited={m.cited} model={m.model} source={m.source} />
                      <div
                        className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-2.5 text-sm leading-[1.9] text-ink-2 [&_p:first-of-type]:mt-0 [&_p:last-of-type]:mb-0"
                        data-ask-answer=""
                      >
                        <Markdown text={m.answer} />
                      </div>
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
                            收起命盘
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
                          在对话里看这张盘
                        </button>
                      )
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={m.id}
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
                    <div
                      className="text-sm leading-[1.95] text-ink-2 [&_p:first-of-type]:mt-0"
                      data-ask-answer=""
                    >
                      <Markdown text={m.answer} />
                    </div>
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
                              收起命盘
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
                            在对话里看这张盘
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {pending && pendingQuestion && (bare ? (
            <div
              className="chart-submit mt-4 space-y-1.5"
              style={motionStyle(DURATION.sanfang)}
              role="status"
            >
              <span className="sr-only">查证中</span>
              <p className="text-right">
                <span className="inline-block max-w-[85%] rounded-2xl rounded-br-sm bg-zhu px-3.5 py-2 text-left text-xs leading-relaxed text-white">
                  {pendingQuestion}
                </span>
              </p>
              <div>
                <AnswerAvatar />
                {stream?.text ? (
                  /* 流式：模型吐一个字就显示一个字 */
                  <div className="rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-2.5 text-sm leading-[1.9] text-ink-2 [&_p:first-of-type]:mt-0 [&_p:last-of-type]:mb-0">
                    <Markdown text={stream.text} />
                    <span
                      aria-hidden="true"
                      className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-zhu motion-reduce:animate-none"
                    />
                  </div>
                ) : stream?.thinking ? (
                  /* 思考期：把思维链实时显示出来 —— 6–8 秒的空白等待变成看得见的进度 */
                  <ThinkingBlock text={stream.thinking} />
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 motion-reduce:animate-none" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:150ms] motion-reduce:animate-none" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:300ms] motion-reduce:animate-none" />
                    {/* 模型在思考时并没有字可吐，明确说清楚在干嘛 */}
                    <span className="text-xs text-ink-2">正在思考…</span>
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
                  <ThinkingBlock text={stream.thinking} />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-zhu motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-ink-2">星图检索中…</p>
                    </div>
                    <p className="mt-1.5 text-2xs text-ink-2">
                      正在核对盘面并检索数据集原文，通常需要几秒。
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
                  <button
                    type="button"
                    onClick={() => submit(transient.retryQuestion)}
                    disabled={pending}
                    className="mt-3 rounded-lg border border-zhu/25 bg-surface px-3 py-2 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                  >
                    重试
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {/* 输入区：bare = 聊天式胶囊输入（Enter 发送），非 bare = 表单式 */}
        {bare ? (
          <div className="mt-4 shrink-0 border-t border-lineSoft pt-3 pb-[env(safe-area-inset-bottom)]">
            {/* 意图芯片：空态时用大卡片引导（有消息后才收成这排小胶囊） */}
            {messages.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-1.5" aria-label="问点什么">
                {presets.map((p) => (
                  <button
                    key={p.question}
                    type="button"
                    onClick={() =>
                      submit(
                        p.question,
                        p.dimension || p.time
                          ? { dimension: p.dimension, time: p.time }
                          : undefined,
                      )
                    }
                    disabled={pending}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:border-zhu hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleDeepThink}
                aria-pressed={deepThink}
                title="深度思考：模型先推演再作答，应期、四化串联更严谨，但更慢；关闭后更快更省。仅对支持思考的模型（如 DeepSeek）生效。"
                className={
                  CHIP_CLASS +
                  (deepThink
                    ? ' border-zhu/50 text-ink'
                    : ' border-line text-ink-2 opacity-70')
                }
              >
                {deepThink ? '● 深度思考：开' : '○ 深度思考：关'}
              </button>
            </div>
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
                placeholder={pending ? '正在回答中，可以先把下一句打好…' : '问问感情、事业、今年如何…'}
                className={`chat-input flex-1 ${inputTall ? '!rounded-2xl' : ''}`}
              />
              <button
                type="button"
                onClick={() => submit(question)}
                disabled={!question.trim()}
                aria-label={pending ? '回答中，点击先排队' : '发送'}
                title={pending ? '回答中 —— 点击把这句话排到下一条' : '发送'}
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
                已排队：「{queuedText}」—— 这条回答结束后自动发送
              </p>
            )}
            {messages.length > 0 && (
              <div className="mt-2 flex items-center justify-center gap-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('清空当前这段对话？其他对话会保留。')) clear();
                  }}
                  className="text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  清空对话
                </button>
                {activeId && activeId !== '__draft__' && (
                  <button
                    type="button"
                    onClick={() => archiveThread(activeId)}
                    title="从对话记录里收起来，可在「对话记录」下拉的「已归档」分组找回"
                    className="text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                  >
                    归档这段对话
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="mt-6 border-t border-line pt-5">
          <label htmlFor="ask-question" className="field-label">
            你的问题
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
                ? '正在回答中，可以先把下一句打好…'
                : messages.length > 0
                  ? '接着上面的对话继续问，例如：那财运方面呢？'
                  : '例如：这份命盘在职业方向上有什么特点？'
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
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleDeepThink}
              aria-pressed={deepThink}
              title="深度思考：模型先推演再作答，应期、四化串联更严谨，但更慢；关闭后更快更省。仅对支持思考的模型（如 DeepSeek）生效。"
              className={
                CHIP_CLASS +
                (deepThink ? ' border-zhu/50 text-ink' : ' border-line text-ink-2 opacity-70')
              }
            >
              {deepThink ? '● 深度思考：开' : '○ 深度思考：关'}
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
            {pending ? '正在查证…' : '追问'}
          </button>
          <p id="ask-submit-hint" className="mt-2 text-2xs text-ink-2">
            {pending
              ? '查证进行中，请稍候。'
              : messages.length > 0
                ? '会带上这张盘之前的对话作为语境。也可 ⌘/Ctrl + Enter。'
                : '提交后将依据本盘与数据集原文作答。也可 ⌘/Ctrl + Enter。'}
          </p>
        </div>

        {messages.length > 0 && (
          <div className="mt-4 flex justify-end border-t border-lineSoft pt-3">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('清空当前这段对话？其他对话会保留。')) clear();
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              清空对话
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {!bare && (
        <p className="mt-3 text-2xs leading-relaxed text-ink-2">
          回答只依据这张盘的已有材料推演：先给结论，再逐条讲依据。内容仅供参考，不构成医疗、法律或投资建议。
        </p>
      )}
    </div>
  );
}
