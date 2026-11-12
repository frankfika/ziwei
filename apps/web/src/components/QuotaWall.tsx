'use client';

/**
 * 额度墙 —— 内置 AI 的每日免费额度用尽时显示。
 *
 * 三件事说清楚：为什么被墙、还能怎么办（自己的 Key / 流量包）、流量包入口在哪。
 * 购买走真实支付（支付宝当面付）：出二维码 → 轮询到账（见 /api/checkout、/api/pay/status）。
 *
 * **未登录不能买包**：点「购买」先弹登录表单，登录成功才下单。
 */

import { useEffect, useRef, useState } from 'react';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';
import type { TrafficPack } from '@/lib/trafficPacks';
import LoginPanel from './LoginPanel';

/** 一次扫码支付的进行中状态 */
interface PaySession {
  orderId: string;
  qrDataUrl: string;
  pack: TrafficPack;
}

export default function QuotaWall({
  limit,
  packs,
  checkout,
  loggedIn = false,
  survey = false,
  onPaid,
}: {
  /** 每日上限 */
  limit: number;
  /** 可选套餐 */
  packs: TrafficPack[];
  /** 下单路径 */
  checkout: string;
  /** 是否已登录（未登录购买要先登录） */
  loggedIn?: boolean;
  /** 服务端是否配置了问卷解锁（CPX） */
  survey?: boolean;
  /** 支付成功回调（父组件刷新余额用） */
  onPaid?: (asks: number) => void;
}) {
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [pay, setPay] = useState<PaySession | null>(null);
  const [payState, setPayState] = useState<'waiting' | 'ok' | 'closed'>('waiting');
  const [payError, setPayError] = useState<string | null>(null);
  // 未登录时点购买 → 先展开登录表单
  const [needLogin, setNeedLogin] = useState(false);
  // 问卷墙：url 拿到了才渲染 iframe 弹层
  const [surveyUrl, setSurveyUrl] = useState<string | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // 组件卸载 / 支付结束：停掉轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function buy(pack: TrafficPack) {
    if (!loggedIn) {
      setNeedLogin(true);
      return;
    }
    setBusy(pack.id);
    setAdded(null);
    setPayError(null);
    try {
      const res = await fetch(checkout, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        orderId?: string;
        qrDataUrl?: string;
      } | null;
      if (!j?.ok || !j.orderId || !j.qrDataUrl) {
        setPayError(
          j?.error === 'PAYMENT_NOT_CONFIGURED'
            ? copy.payNotConfigured
            : copy.payFailed(j?.detail ?? j?.error ?? copy.unknownError),
        );
        return;
      }
      setPay({ orderId: j.orderId, qrDataUrl: j.qrDataUrl, pack });
      setPayState('waiting');
      startPolling(j.orderId, pack.asks);
    } catch {
      /* 网络失败：静默 —— 订单没建，余额不变 */
    } finally {
      setBusy(null);
    }
  }

  /** 每 3 秒问一次支付结果，最多 3 分钟；paid / closed 停止 */
  function startPolling(orderId: string, asks: number) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    const started = Date.now();
    pollRef.current = window.setInterval(async () => {
      if (Date.now() - started > 180_000) {
        stopPolling('closed');
        return;
      }
      try {
        const res = await fetch(`/api/pay/status?orderId=${encodeURIComponent(orderId)}`, {
          cache: 'no-store',
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          status?: 'paid' | 'waiting' | 'closed';
        } | null;
        if (j?.ok && j.status === 'paid') {
          stopPolling('ok');
          setAdded(asks);
          onPaid?.(asks);
        } else if (j?.ok && j.status === 'closed') {
          stopPolling('closed');
        }
      } catch {
        /* 单次网络抖动：下一轮继续 */
      }
    }, 3000);
  }

  function stopPolling(end: 'ok' | 'closed') {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
    setPayState(end);
    if (end === 'closed') setPay(null);
  }

  /** 问卷换次数：未登录先登录（奖励要落到账户）；已登录拿墙 URL 弹 iframe */
  async function openSurvey() {
    if (!loggedIn) {
      setNeedLogin(true);
      return;
    }
    setSurveyLoading(true);
    setSurveyError(null);
    try {
      const res = await fetch('/api/survey/cpx', { cache: 'no-store' });
      const j = (await res.json().catch(() => null)) as { ok?: boolean; wallUrl?: string } | null;
      if (!j?.ok || !j.wallUrl) {
        setSurveyError(copy.surveyLoadingFailed);
        return;
      }
      setSurveyUrl(j.wallUrl);
    } catch {
      setSurveyError(copy.surveyLoadingFailed);
    } finally {
      setSurveyLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-hua-ke/40 bg-surface-2 px-4 py-4"
      data-quota-wall=""
      role="alert"
    >
      <p className="text-sm font-medium text-ink">{copy.wallTitle}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
        {copy.wallBody(limit, loggedIn ? 'account' : 'ip')}
      </p>

      {packs.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-2xs text-ink-2">{copy.packsTitle}</p>
          <div className="flex flex-wrap gap-2">
            {packs.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => buy(p)}
                disabled={busy !== null}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-1.5 text-xs text-zhu transition-colors hover:bg-zhu-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                <span>
                  {copy.packAsks(p.asks)} · ¥{p.priceCny} / ${p.priceUsd.toFixed(2)}
                </span>
                <span aria-hidden="true" className="text-ink-3">
                  {busy === p.id ? '…' : copy.buy}
                </span>
              </button>
            ))}
          </div>
          {added !== null && (
            <p className="mt-2 text-2xs text-ink-2" role="status">
              {copy.packAdded(added)}
            </p>
          )}
          {payError && (
            <p className="mt-2 text-2xs text-danger" role="alert">
              {payError}
            </p>
          )}
        </div>
      )}

      {/* 扫码支付弹层：二维码 + 轮询结果 */}
      {pay && (
        <div className="mt-3 rounded-lg border border-line bg-surface px-4 py-4 text-center">
          <p className="text-xs font-medium text-ink">{copy.payTitle(pay.pack.priceCny, pay.pack.asks)}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pay.qrDataUrl} alt="支付宝收款二维码" className="mx-auto mt-2 h-48 w-48" />
          {payState === 'waiting' && (
            <p className="mt-1.5 text-2xs leading-relaxed text-ink-2" role="status">
              {copy.payScan}
              <span className="mt-0.5 block animate-pulse">{copy.payWaiting}</span>
            </p>
          )}
          {payState === 'ok' && (
            <p className="mt-1.5 text-2xs font-medium text-hua-lu" role="status">
              ✓ {copy.payOk(pay.pack.asks)}
            </p>
          )}
        </div>
      )}

      {survey && (
        <div className="mt-3">
          <p className="mb-1.5 text-2xs text-ink-2">{copy.surveyTitle}</p>
          <p className="text-2xs leading-relaxed text-ink-2">{copy.surveyBody}</p>
          <button
            type="button"
            onClick={openSurvey}
            disabled={surveyLoading}
            className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-1.5 text-xs text-zhu transition-colors hover:bg-zhu-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            {surveyLoading ? copy.surveyOpen : copy.surveyCta}
          </button>
          {surveyError && (
            <p className="mt-2 text-2xs text-danger" role="alert">
              {surveyError}
            </p>
          )}
        </div>
      )}

      {/* 问卷墙弹层：CPX iframe；关闭刷新余额（奖励 postback 是异步的） */}
      {surveyUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
          <div className="flex h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-line bg-surface">
            <iframe
              src={surveyUrl}
              title={copy.surveyTitle}
              className="min-h-0 flex-1 rounded-t-xl"
            />
            <div className="border-t border-line px-4 py-2.5">
              <p className="text-2xs leading-relaxed text-ink-2">{copy.surveyDone}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                {copy.surveyClose}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loggedIn && (
        <div className="mt-3">
          <p className="text-2xs leading-relaxed text-ink-2">{copy.loginRequired}</p>
          {needLogin ? (
            <div className="mt-2">
              <LoginPanel
                compact
                onSuccess={() => {
                  // 登录成功 —— 刷新页面让额度墙拿到新的登录态
                  window.location.reload();
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNeedLogin(true)}
              className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-1.5 text-xs text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.loginCta}
            </button>
          )}
        </div>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">{copy.ownKeyHint}</p>
    </div>
  );
}
