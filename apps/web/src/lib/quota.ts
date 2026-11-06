/**
 * 追问额度的**纯逻辑**（无 IO、无服务端依赖，客户端也能 import）。
 *
 * 口径：内置 AI 的免费追问 **每天限 DAILY_LIMIT 次**，按 **UTC 日**切
 * （`day` 串是 `YYYY-MM-DD` 的 UTC 日期；00:00 UTC 刷新）。
 * 归属键由调用方给：未登录按 IP、已登录按 userId（见 lib/quotaStore.ts）。
 * 用户自备 Key 不走这套额度（不限量）。
 */

/** 默认每日免费追问次数 */
export const DAILY_LIMIT = 3;

/** 环境变量 ZIWEI_ASK_DAILY_LIMIT → 实际生效的每日次数；非法/缺省回落默认 */
export function resolveDailyLimit(raw?: string): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DAILY_LIMIT;
}

// ── VIP 白名单 ─────────────────────────────────────────────────────
//
// 口径：ZIWEI_VIP_EMAILS / ZIWEI_VIP_IPS 里的用户不受普通免费日额限制；
// ZIWEI_VIP_DAILY_LIMIT 控制 VIP 自己的每日上限（**0 或缺省 = 不限量**）。
// 邮箱条目可以是邮箱本身，也可以是 userId（sha256(email) 前 32 位，账号的稳定 uuid）。

/** VIP 每日上限：0 = 不限量（默认）。非法值按不限量处理 —— VIP 不该被笔误坑成 3 次 */
export function resolveVipLimit(raw?: string): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** 逗号/换行分隔的白名单 → 条目数组（去空、小写；邮箱比较不区分大小写） */
export function parseVipEntries(raw?: string): string[] {
  return (raw ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 落盘结构：day → 归属键 → 已用次数 */
export type QuotaStore = Record<string, Record<string, number>>;

/** 纯函数：给 (day, key) 记一次，返回剩余次数；到限返回 null（store 不变） */
export function bumpQuota(
  store: QuotaStore,
  day: string,
  key: string,
  limit = DAILY_LIMIT,
): { store: QuotaStore; remaining: number } | null {
  const used = store[day]?.[key] ?? 0;
  if (used >= limit) return null;
  const next: QuotaStore = { [day]: { ...store[day], [key]: used + 1 } };
  return { store: next, remaining: limit - used - 1 };
}
