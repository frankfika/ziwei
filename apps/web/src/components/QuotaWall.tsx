'use client';

/**
 * 额度墙 —— 内置 AI 的每日免费额度用尽时显示。
 *
 * 三件事说清楚：为什么被墙、还能怎么办（自己的 Key / 流量包）、流量包入口在哪。
 * 流量包价格是占位值（见 lib/trafficPacks.ts），下单走 stub，不收款。
 */

import { useState } from 'react';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';
import type { TrafficPack } from '@/lib/trafficPacks';

export default function QuotaWall({
  limit,
  packs,
  checkout,
}: {
  /** 每日上限 */
  limit: number;
  /** 可选套餐 */
  packs: TrafficPack[];
  /** 下单 stub 路径 */
  checkout: string;
}) {
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const [busy, setBusy] = useState<string | null>(null);
  // 只记「是否已提示」—— 文案现取 copy.payStub，切语言时自动跟着变
  const [noted, setNoted] = useState(false);

  async function buy(pack: TrafficPack) {
    setBusy(pack.id);
    setNoted(false);
    try {
      const res = await fetch(checkout, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ packId: pack.id }),
      });
      // 文案走本地 QUOTA_COPY（中英），服务端只回 ok —— 不在服务端写死中文
      await res.json().catch(() => null);
      setNoted(true);
    } catch {
      setNoted(true);
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
      <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{copy.wallBody(limit)}</p>

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
          {noted && (
            <p className="mt-2 text-2xs text-ink-2" role="status">
              {copy.payStub}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">{copy.ownKeyHint}</p>
    </div>
  );
}
