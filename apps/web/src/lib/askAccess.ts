import { headers } from 'next/headers';

import {
  accountQuota,
  chargeUserAsk,
  refundUserAsk,
  userIdFor,
  type ChargeKind,
} from './account';
import { parseVipEntries, resolveDailyLimit, resolveVipLimit } from './quota';
import {
  bucketIp,
  bucketUser,
  bump,
  refund as refundBucket,
  usedIn,
  utcDay,
} from './quotaStore';

/**
 * 「这次追问要不要扣额度、扣谁的」—— 统一入口。
 *
 * 口径：
 *   · VIP（白名单） → 不限量或按 VIP 日额，完全不碰免费/流量包额度；
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

/**
 * VIP 判定：命中白名单返回 VIP 每日上限（0 = 不限量），未命中返回 null。
 *
 * ZIWEI_VIP_EMAILS：逗号分隔，条目可以是邮箱，也可以是账号 uuid（userIdFor(email)）；
 * ZIWEI_VIP_IPS：逗号分隔的 IP，给不登录的名单用。
 */
export function vipLimitFor(subject: QuotaSubject): number | null {
  const emails = parseVipEntries(process.env.ZIWEI_VIP_EMAILS);
  const ips = parseVipEntries(process.env.ZIWEI_VIP_IPS);
  const hit =
    subject.kind === 'user'
      ? emails.some((e) => (e.includes('@') ? userIdFor(e) === subject.userId : e === subject.userId))
      : ips.includes(subject.ip.toLowerCase());
  return hit ? resolveVipLimit(process.env.ZIWEI_VIP_DAILY_LIMIT) : null;
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
  // VIP：不限量直接放行（没有可退的东西）；有日额则按 VIP 日额计数，不碰免费/流量包
  const vip = vipLimitFor(subject);
  if (vip === 0) return { ok: true, refund: () => {} };
  if (vip !== null) {
    const day = utcDay();
    const bucket = subject.kind === 'user' ? bucketUser(subject.userId) : bucketIp(subject.ip);
    const r = bump(bucket, day, vip);
    if (!r) return { ok: false, limit: vip };
    return { ok: true, refund: () => refundBucket(bucket, day) };
  }

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
  /** 是否命中 VIP 白名单 */
  vip: boolean;
} {
  const vip = vipLimitFor(subject);
  if (vip !== null) {
    const packBalance =
      subject.kind === 'user' ? accountQuota(subject.userId).packBalance : 0;
    if (vip === 0) {
      // 不限量：limit 用 0 表示，前端据此显示「VIP · 不限量」
      return { limit: 0, used: 0, remaining: 0, packBalance, vip: true };
    }
    const bucket = subject.kind === 'user' ? bucketUser(subject.userId) : bucketIp(subject.ip);
    const used = usedIn(bucket);
    return { limit: vip, used, remaining: Math.max(0, vip - used), packBalance, vip: true };
  }

  const limit = dailyLimit();
  if (subject.kind === 'user') {
    return { ...accountQuota(subject.userId), vip: false };
  }
  const used = usedIn(bucketIp(subject.ip));
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    packBalance: 0,
    vip: false,
  };
}
