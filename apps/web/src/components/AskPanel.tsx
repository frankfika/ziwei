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
import { askChart, type AskActionResult } from '@/app/ask-action';
import { chartKey } from '@/lib/history';
import { useAskThread, type AskMessage } from '@/lib/askThreads';
import { DURATION, motionStyle, preferredScrollBehavior } from '@/lib/motion';
import Markdown from './Markdown';
import MiniChart from './MiniChart';
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

/** 回答者身份行：紫圆「紫」字头像 + 名字 +  tiny 引用维度（替代单独的依据行） */
function AnswerAvatar({ cited }: { cited?: string[] }) {
  return (
    <p className="mb-1 flex items-center gap-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zhu text-[10px] leading-none text-white">
        紫
      </span>
      <span className="text-2xs font-medium text-ink-2">紫微</span>
      {cited && cited.length > 0 && (
        <span className="text-2xs text-ink-3">· 参 {cited.join('、')}</span>
      )}
    </p>
  );
}

/** 服务端返回的非 ok 状态 / 本地失败 —— 不进线程，作为临时提示展示 */
type Transient =
  | { kind: 'not-covered' | 'not-configured'; message: string }
  | { kind: 'error' | 'local-error'; message: string; retryQuestion: string };

function suspectsOf(result: Extract<AskActionResult, { status: 'ok' }>): string[] {
  const v = result.verification;
  return [
    ...v.suspectStars.map((s) => `星曜「${s}」`),
    ...v.suspectPalaces.map((s) => `宫位「${s}」`),
    ...v.suspectPlacements.map((s) => `落宫「${s}」`),
  ];
}

function MessageMeta({ message }: { message: AskMessage }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-2xs text-ink-3">
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
  const { messages, append, clear } = useAskThread(identity);
  const [question, setQuestion] = useState('');
  const [transient, setTransient] = useState<Transient | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  /** 下一条问题的页内焦点（维度/宫位），发出即清 */
  const [focus, setFocus] = useState<{ dimension?: string; palace?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const resultId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const consumedSeedRef = useRef<number | null>(null);
  /** 对话内嵌盘：服务端算好后缓存，展开时渲染 */
  const [miniChart, setMiniChart] = useState<ChatChartPayload | null>(null);
  const [chartLayer, setChartLayer] = useState<'natal' | 'liunian'>('natal');
  /** 展开了迷你盘的消息 id */
  const [chartOpenFor, setChartOpenFor] = useState<string | null>(null);

  /** 推荐/意图芯片统一成 { label, question, dimension? } */
  const presets: AskQuickPrompt[] =
    quickPrompts ?? PRESETS.map((p) => ({ label: p, question: p }));

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

  function submit(
    q: string,
    chipFocus?: { dimension?: string; palace?: string; time?: 'liunian' | 'daxian' },
  ) {
    const text = q.trim();
    if (!text || pending) return;

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
        messages.slice(-CONTEXT_TURNS).map((m) => ({ question: m.question, answer: m.answer })),
      ),
    );

    startTransition(async () => {
      try {
        const r = await askChart(fd);
        if (r.status === 'ok') {
          append({
            question: text,
            answer: r.answer,
            cited: r.citedDimensions,
            suspects: suspectsOf(r),
            ...(r.model ? { model: r.model } : {}),
          });
        } else if (r.status === 'not-configured') {
          // 环境变量名等配置细节给运维看（console），用户只看一句人话
          console.debug('[ask] not-configured:', r.message, r.missing);
          setTransient({ kind: 'not-configured', message: '智能追问暂未开启，请稍后再试。' });
        } else if (r.status === 'not-covered') {
          setTransient({ kind: 'not-covered', message: r.message });
        } else if (r.status === 'quota') {
          setTransient({ kind: 'not-covered', message: r.message });
        } else {
          setTransient({ kind: 'error', message: r.message, retryQuestion: text });
        }
      } catch {
        setTransient({
          kind: 'local-error',
          message: '追问请求失败，可能是网络波动或服务暂时不可用。请稍后重试。',
          retryQuestion: text,
        });
      } finally {
        setPendingQuestion(null);
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
                  <span className="ml-2 text-2xs font-normal tracking-normal text-ink-3">
                    已存 {messages.length} 条对话
                  </span>
                )}
              </span>
              <span className="mt-1 block text-2xs font-normal text-ink-3">
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
              className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3 py-2 text-2xs text-ink-3 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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

        {/* 对话线程 */}
        <div
          id={resultId}
          aria-live="polite"
          aria-busy={pending}
          className={bare ? 'min-h-0 flex-1 overflow-y-auto' : undefined}
        >
          {messages.length === 0 && !pending && !transient && bare && (
            <div className="flex h-full flex-col items-center justify-start gap-1 pt-12 text-center" role="status">
              <p className="text-sm text-ink-2">
                {subjectName ? `围绕 ${subjectName} 的盘提问` : '围绕这张盘提问'}
              </p>
              <p className="text-2xs leading-relaxed text-ink-3">
                回答只依据数据集原文，对话只存在本机。
              </p>
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

          <div className={bare ? 'space-y-4' : 'space-y-5'}>
            {messages.map((m) => {
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
                      <AnswerAvatar cited={m.cited} />
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
                            className="mt-1.5 text-2xs text-ink-3 underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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
                          className="text-2xs text-ink-3 underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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
                              className="mt-2 inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-2.5 py-1 text-2xs leading-none text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
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
                <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-lineSoft bg-surface-2 px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-3/60 [animation-delay:300ms] motion-reduce:animate-none" />
                </div>
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
                <div className="flex items-center gap-3">
                  <span
                    className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-zhu motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-ink-2">星图检索中…</p>
                </div>
                <p className="mt-1.5 text-2xs text-ink-3">
                  正在核对盘面并检索数据集原文，通常需要几秒。
                </p>
              </div>
            </div>
          ))}

          {transient && (
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
          )}
        </div>

        {/* 输入区：bare = 聊天式胶囊输入（Enter 发送），非 bare = 表单式 */}
        {bare ? (
          <div className="mt-4 shrink-0 border-t border-lineSoft pt-3 pb-[env(safe-area-inset-bottom)]">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="问点什么">
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
                  className="text-2xs text-ink-3 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  {p.label}
                </button>
              ))}
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
                maxLength={500}
                placeholder="问问感情、事业、今年如何…"
                className="field-input min-h-11 flex-1 resize-none rounded-full px-4 py-2.5 leading-relaxed"
                disabled={pending}
              />
              <button
                type="button"
                onClick={() => submit(question)}
                disabled={pending || !question.trim()}
                aria-label="发送"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zhu text-white transition-colors hover:bg-zhu-deep disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                ↑
              </button>
            </div>
            {messages.length > 0 && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('清空这张盘的全部追问对话？')) clear();
                  }}
                  className="text-2xs text-ink-3 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  清空对话
                </button>
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
            maxLength={500}
            placeholder={
              messages.length > 0
                ? '接着上面的对话继续问，例如：那财运方面呢？'
                : '例如：这份命盘在职业方向上有什么特点？'
            }
            className="field-input resize-y leading-relaxed"
            disabled={pending}
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
          <p id="ask-submit-hint" className="mt-2 text-2xs text-ink-3">
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
                if (window.confirm('清空这张盘的全部追问对话？')) clear();
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-3 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              清空对话
            </button>
          </div>
        )}
        </>
        )}
      </div>

      {!bare && (
        <p className="mt-3 text-2xs leading-relaxed text-ink-3">
          回答只依据这张盘的已有材料推演：先给结论，再逐条讲依据。内容仅供参考，不构成医疗、法律或投资建议。
        </p>
      )}
    </div>
  );
}
