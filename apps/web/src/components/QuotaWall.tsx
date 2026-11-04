'use client';

/**
 * 额度墙 —— 内置 AI 的每日免费额度用尽时显示。
 *
 * 三件事说清楚：为什么被墙、还能怎么办（自己的 Key / 流量包）、流量包入口在哪。
 * 流量包价格是占位值（见 lib/trafficPacks.ts），下单走 stub，不收款。
 *
 * **未登录不能买包**：点「购买」先弹登录表单，登录成功才下单。
 */

import { useState } from 'react';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';
import type { TrafficPack } from '@/lib/trafficPacks';
import LoginPanel from './LoginPanel';

export default function QuotaWall({
  limit,
  packs,
  checkout,
  loggedIn = false,
}: {
  /** 每日上限 */
  limit: number;
  /** 可选套餐 */
  packs: TrafficPack[];
  /** 下单 stub 路径 */
  checkout: string;
  /** 是否已登录（未登录购买要先登录） */
  loggedIn?: boolean;
}) {
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const [busy, setBusy] = useState<string | null>(null);
  // 只记「是否已提示」—— 文案现取 copy.packAdded，切语言时自动跟着变
  const [added, setAdded] = useState<number | null>(null);
  // 未登录时点购买 → 先展开登录表单
  const [needLogin, setNeedLogin] = useState(false);

  async function buy(pack: TrafficPack) {
    if (!loggedIn) {
      setNeedLogin(true);
      return;
    }
    setBusy(pack.id);
    setAdded(null);
    try {
      const res = await fetch(checkout, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      // 文案走本地 QUOTA_COPY（中英），服务端只回 ok —— 不在服务端写死中文
      const j = (await res.json().catch(() => null)) as { ok?: boolean; asks?: number } | null;
      if (j?.ok) setAdded(j.asks ?? pack.asks);
    } catch {
      /* 网络失败：静默 —— 额度没加，状态不变 */
    } finally {
      setBusy(null);
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
