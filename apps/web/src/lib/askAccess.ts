import { headers } from 'next/headers';

import { accountQuota, chargeUserAsk, refundUserAsk, type ChargeKind } from './account';
import { resolveDailyLimit } from './quota';
import { bucketIp, bump, refund as refundBucket, usedIn, utcDay } from './quotaStore';

/**
 * 「这次追问要不要扣额度、扣谁的」—— 统一入口。
 *
 * 口径：
 *   · 用户自备 Key → 完全不扣（不限量），不占任何额度；
 *   · 已登录用户   → 按 userId 扣：**先免费日额 → 再流量包余额**；
 *   · 未登录访客   → 按 IP 扣免费日额。
 *
 * 额度口径是 **先占后还**：提问前占一次，失败（provider 报错 / 样本库未覆盖）
 * 调 `refund()` 把同一次还回去 —— 所以「失败不扣次」。
 */

/** 每日上限（默认 3，env 可覆盖） */
export function dailyLimit(): number {
  return resolveDailyLimit(process.env.ZIWEI_ASK_DAILY_LIMIT);
}

/** 额度归属：已登录按账户，未登录按 IP */
export type QuotaSubject =
  | { kind: 'user'; userId: string }
  | { kind: 'ip'; ip: string };

/** 当前请求的 IP（归属键之一） */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown'
  ).trim();
}

/** 占位成功 → 拿到一个「还回去」的函数 */
export interface Reservation {
  ok: true;
  /** 失败时调用，退还这一次 */
  refund: () => void;
}

/** 占位失败 → 出墙 */
export interface Denied {
  ok: false;
  /** 每日上限（出墙文案用） */
  limit: number;
}

/**
 * 占一次额度。
 *
 * @param subject 已登录传 user，否则传 ip
 */
export function reserveFor(subject: QuotaSubject): Reservation | Denied {
  if (subject.kind === 'user') {
    const r = chargeUserAsk(subject.userId);
    if (!r.ok) return { ok: false, limit: r.limit };
    const kind: ChargeKind = r.kind;
    const userId = subject.userId;
    return { ok: true, refund: () => refundUserAsk(userId, kind) };
  }

  const limit = dailyLimit();
  const day = utcDay();
  const r = bump(bucketIp(subject.ip), day, limit);
  if (!r) return { ok: false, limit };
  const ip = subject.ip;
  return { ok: true, refund: () => refundBucket(bucketIp(ip), day) };
}

/** 额度快照（只读，给 /api/quota） */
export function snapshotFor(subject: QuotaSubject): {
  limit: number;
  used: number;
  remaining: number;
  packBalance: number;
} {
  const limit = dailyLimit();
  if (subject.kind === 'user') {
    return accountQuota(subject.userId);
  }
  const used = usedIn(bucketIp(subject.ip));
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    packBalance: 0,
  };
}
