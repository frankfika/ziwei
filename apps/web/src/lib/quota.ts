/**
 * 追问额度的**纯逻辑**（无 IO、无服务端依赖，客户端也能 import）。
 *
 * 口径：内置 AI 的免费追问 **每天每 IP 限 DAILY_LIMIT 次**，按 **UTC 日**切
 * （`day` 串是 `YYYY-MM-DD` 的 UTC 日期；00:00 UTC 刷新）。
 * 用户自备 Key 不走这套额度（不限量）。
 */

/** 默认每日免费追问次数 */
export const DAILY_LIMIT = 3;

/** 环境变量 ZIWEI_ASK_DAILY_LIMIT → 实际生效的每日次数；非法/缺省回落默认 */
export function resolveDailyLimit(raw?: string): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DAILY_LIMIT;
}

/** 落盘结构：day → ip → 已用次数 */
export type QuotaStore = Record<string, Record<string, number>>;

/** 纯函数：给 (day, ip) 记一次，返回剩余次数；到限返回 null（store 不变） */
export function bumpQuota(
  store: QuotaStore,
  day: string,
  ip: string,
  limit = DAILY_LIMIT,
): { store: QuotaStore; remaining: number } | null {
  const used = store[day]?.[ip] ?? 0;
  if (used >= limit) return null;
  const next: QuotaStore = { [day]: { ...store[day], [ip]: used + 1 } };
  return { store: next, remaining: limit - used - 1 };
}
