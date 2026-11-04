'use client';

/**
 * 「我的额度」页 —— /account
 *
 * 未登录：登录表单（邮箱验证码）。
 * 已登录：邮箱、今日免费剩余、流量包余额、最近 stub 订单，可退出登录。
 *
 * 额度口径与 /api/quota 一致：免费按 userId 每天 N 次（UTC 日），
 * 流量包余额是购买获得的追问次数，两者分开。
 */

import { useCallback, useEffect, useState } from 'react';
import LoginPanel from '@/components/LoginPanel';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';

interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  packBalance: number;
}

interface OrderItem {
  id: string;
  packId: string;
  asks: number;
  priceCny: number;
  priceUsd: number;
  createdAt: string;
  status: 'stub' | 'pending' | 'paid' | 'closed';
}

export default function AccountPage() {
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading');
  const [email, setEmail] = useState('');
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/quota', { cache: 'no-store' });
      if (!res.ok) {
        setState('out');
        return;
      }
      const j = (await res.json()) as { email: string; quota: QuotaInfo; orders: OrderItem[] };
      setEmail(j.email);
      setQuota(j.quota);
      setOrders(j.orders ?? []);
      setState('in');
    } catch {
      setState('out');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setState('out');
    setQuota(null);
    setOrders([]);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-8">
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">ACCOUNT</p>
        <h1 className="text-3xl font-semibold tracking-[0.12em] text-ink">{copy.accountTitle}</h1>
      </header>

      {state === 'loading' && (
        <p className="text-sm text-ink-2" role="status">
          …
        </p>
      )}

      {state === 'out' && (
        <div className="max-w-md">
          <LoginPanel onSuccess={() => void load()} />
        </div>
      )}

      {state === 'in' && quota && (
        <div className="space-y-8">
          <section className="rounded-xl border border-line bg-surface-2 px-5 py-4">
            <dl className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-ink-2">{copy.accountEmail}</dt>
                <dd className="text-ink">{email}</dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-ink-2">{copy.accountFreeLabel}</dt>
                <dd className="text-ink">
                  {copy.accountFree(quota.remaining, quota.limit)}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="text-ink-2">{copy.accountPackLabel}</dt>
                <dd className="text-ink">{copy.accountPack(quota.packBalance)}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={logout}
              className="mt-4 inline-flex min-h-9 items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.logout}
            </button>
          </section>

          <section>
            <h2 className="mb-3 text-base tracking-[0.2em] text-ink">{copy.accountOrders}</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-ink-2">{copy.accountNoOrders}</p>
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lineSoft bg-surface-2 px-3 py-2 text-xs text-ink-2"
                  >
                    <span>
                      {copy.accountOrderItem(
                        o.asks,
                        new Date(o.createdAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }),
                      )}
                    </span>
                    <span className="text-ink-3">
                      {copy.orderStatus(o.status)} · ¥{o.priceCny} / ${o.priceUsd.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
