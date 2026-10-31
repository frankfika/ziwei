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
import { preferredScrollBehavior } from '@/lib/motion';
import Markdown from './Markdown';

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
}

const PRESETS = [
  '这份命盘在职业方向上有什么特点？',
  '我的感情运势在原文里是怎么说的？',
  '财运方面，原文给了哪些倾向？',
];

/** 带入下一轮问题的上文轮数 */
const CONTEXT_TURNS = 6;

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
      <span>
        {new Date(message.at).toLocaleString('zh-CN', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  );
}

function MessageVerification({ suspects, isLatest }: { suspects: string[]; isLatest: boolean }) {
  if (suspects.length > 0) {
    return (
      <div
        className="mt-4 rounded-lg border border-zhu/30 bg-zhu-soft/50 px-4 py-3"
        {...(isLatest ? { 'data-ask-verification': 'warn' } : {})}
        role="alert"
      >
        <p className="text-xs font-medium text-zhu">
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
}: AskPanelProps) {
  const identity = chartKey({ year, month, day, hour, gender });
  const { messages, append, clear } = useAskThread(identity);
  const [question, setQuestion] = useState('');
  const [transient, setTransient] = useState<Transient | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const resultId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

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

  // 新回答进线程后滚到它
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      lastMessageRef.current?.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: 'start',
      });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  function submit(q: string) {
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
    <div className="mt-14 print:hidden" id="ask-panel">
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
              <span className="block font-serif text-sm tracking-[0.2em] text-ink">
                命盘追问
                {messages.length > 0 && (
                  <span className="ml-2 text-2xs font-normal tracking-normal text-ink-3">
                    已存 {messages.length} 条对话
                  </span>
                )}
              </span>
              <span className="mt-1 block text-2xs font-normal text-ink-3">
                围绕这张盘提问，对话只存在本机
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
            {PRESETS.slice(0, 2).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                disabled={pending}
                className="max-w-full whitespace-normal text-left leading-snug rounded-full border border-zhu/25 bg-zhu-soft/40 px-3 py-2 min-h-9 text-2xs text-ink-2 transition-colors hover:border-zhu/50 hover:bg-zhu-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
                window.requestAnimationFrame(() => textareaRef.current?.focus());
              }}
              aria-label="展开更多推荐追问"
              className="inline-flex min-h-9 items-center rounded-full border border-dashed border-line px-3 py-2 text-2xs text-ink-3 transition-colors hover:border-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              更多推荐
            </button>
          </div>
        )}
      </div>

      <div
        id="ask-panel-content"
        hidden={!expanded}
        className="panel p-5 sm:p-6"
      >
        {!providerConfigured && (
          <div
            className="mb-5 rounded-lg border border-line bg-paper px-4 py-3"
            data-ask-provider="not-configured"
            role="status"
          >
            <p className="text-xs leading-relaxed text-ink-2">
              智能追问暂未开启。排盘与解读不受影响，可以照常查看。
            </p>
          </div>
        )}

        {/* 对话线程 */}
        <div id={resultId} aria-live="polite" aria-busy={pending}>
          {messages.length === 0 && !pending && !transient && (
            <div
              className="rounded-lg border border-dashed border-line bg-paper px-4 py-4"
              role="status"
            >
              <p className="text-xs leading-relaxed text-ink-3">
                尚未追问。点选下方推荐问题，或自行输入后提交；对话会存在这张盘下，下次回来接着聊。
              </p>
            </div>
          )}

          <div className="space-y-5">
            {messages.map((m) => {
              const isLatest = m.id === latestId;
              return (
                <div
                  key={m.id}
                  ref={isLatest ? lastMessageRef : undefined}
                  className="rounded-xl border border-line bg-paper px-4 py-4"
                  {...(isLatest ? { 'data-ask-state': 'ok' } : {})}
                >
                  <p className="text-xs font-medium text-ink">
                    <span className="mr-1.5 inline-flex min-w-6 items-center justify-center rounded-md border border-zhu/30 bg-zhu-soft/50 px-1.5 py-0.5 text-2xs text-zhu">
                      问
                    </span>
                    {m.question}
                  </p>
                  <div className="mt-3 border-t border-lineSoft pt-3">
                    <MessageMeta message={m} />
                    <div
                      className="text-sm leading-[1.95] text-ink-2"
                      data-ask-answer=""
                    >
                      <Markdown text={m.answer} />
                    </div>
                    <MessageVerification suspects={m.suspects} isLatest={isLatest} />
                  </div>
                </div>
              );
            })}
          </div>

          {pending && pendingQuestion && (
            <div className="mt-5 rounded-xl border border-line bg-paper px-4 py-4" role="status">
              <p className="text-xs font-medium text-ink">
                <span className="mr-1.5 inline-flex min-w-6 items-center justify-center rounded-md border border-zhu/30 bg-zhu-soft/50 px-1.5 py-0.5 text-2xs text-zhu">
                  问
                </span>
                {pendingQuestion}
              </p>
              <div className="mt-3 flex items-center gap-3 border-t border-lineSoft pt-3">
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-zhu motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <p className="text-xs text-ink-2">
                  正在核对盘面并检索数据集原文，通常需要几秒…
                </p>
              </div>
            </div>
          )}

          {transient && (
            <div
              className="mt-5 rounded-lg border border-line bg-paper px-4 py-3"
              data-ask-state={transient.kind === 'local-error' ? 'error' : transient.kind}
              role={transient.kind === 'local-error' || transient.kind === 'error' ? 'alert' : 'status'}
            >
              <p className="text-xs leading-relaxed text-ink-2">{transient.message}</p>
              {(transient.kind === 'local-error' || transient.kind === 'error') && (
                <button
                  type="button"
                  onClick={() => submit(transient.retryQuestion)}
                  disabled={pending}
                  className="mt-3 rounded-lg border border-zhu/30 bg-surface px-3 py-2 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  重试
                </button>
              )}
            </div>
          )}
        </div>

        {/* 输入区 */}
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

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                disabled={pending}
                className="max-w-full whitespace-normal text-left leading-snug rounded-full border border-line bg-surface px-3 py-2 min-h-9 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {p}
              </button>
            ))}
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
      </div>

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">
        回答只依据这张盘的已有材料，没写到的会直说「材料里没有写」。内容仅供参考，不构成医疗、法律或投资建议。
      </p>
    </div>
  );
}
