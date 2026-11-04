import fs from 'node:fs';
import path from 'node:path';
import { headers } from 'next/headers';
import { bumpQuota, resolveDailyLimit, type QuotaStore } from './quota';

/**
 * 服务端默认 AI 的每日限额 —— 没自配 Key 的访客每天每 IP 限 N 次。
 *
 * 计数落盘 .data/ask-quota.json（只留当天，文件不无限涨），重启不丢。
 * **按 UTC 日切**（`day` = `YYYY-MM-DD` 的 UTC 日期，00:00 UTC 刷新）。
 *
 * 额度口径：**先占后还** —— 提问前原子地占一次（并发也只放行 N 个），
 * 收到完整回答（done）就保留；失败 / 样本库未覆盖则退还，所以「失败不扣次」。
 * 用户自备 Key 完全不走额度（不限量）。
 *
 * ponytail: 单机单进程够用（读写都是同步 fs，进程内原子）；多实例部署换 Redis 之类再说。
 */

export { DAILY_LIMIT, bumpQuota, resolveDailyLimit } from './quota';
export type { QuotaStore } from './quota';

const STORE = path.join(process.cwd(), '.data', 'ask-quota.json');

/** 实际生效的每日次数：默认 3，可用 ZIWEI_ASK_DAILY_LIMIT 覆盖（每次请求时读 env） */
export function dailyLimit(): number {
  return resolveDailyLimit(process.env.ZIWEI_ASK_DAILY_LIMIT);
}

/** 额度归属键：UTC 日 + IP */
export interface QuotaKey {
  day: string;
  ip: string;
}

function readStore(): QuotaStore {
  try {
    const v = JSON.parse(fs.readFileSync(STORE, 'utf8')) as QuotaStore;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** 只保留当天（UTC）的计数，文件不无限涨 */
function writeStore(store: QuotaStore, day: string): void {
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify({ [day]: store[day] ?? {} }));
}

/** 取当前请求的额度归属键（UTC 日 + IP） */
export async function askQuotaKey(): Promise<QuotaKey> {
  const h = await headers();
  const ip = (
    h.get('x-forwarded-for')?.split(',')[0] ??
    h.get('x-real-ip') ??
    'unknown'
  ).trim();
  // UTC 日切：00:00 UTC 刷新
  return { day: new Date().toISOString().slice(0, 10), ip };
}

/**
 * 占一次额度 —— 提问前调用，原子判定并计数。
 * 到限返回 { ok: false }（不计数）；成功返回剩余次数。
 */
export function reserveAskQuota(
  key: QuotaKey,
  limit = dailyLimit(),
): { ok: true; remaining: number } | { ok: false; limit: number } {
  const store = readStore();
  const r = bumpQuota(store, key.day, key.ip, limit);
  if (!r) return { ok: false, limit };
  writeStore(r.store, key.day);
  return { ok: true, remaining: r.remaining };
}

/**
 * 退还一次占用 —— 请求失败时调用（provider 报错 / 样本库未覆盖）。
 * 「失败不扣次」的实现：先占后还。
 */
export function refundAskQuota(key: QuotaKey): void {
  const store = readStore();
  const used = store[key.day]?.[key.ip] ?? 0;
  if (used <= 0) return;
  writeStore(
    { ...store, [key.day]: { ...store[key.day], [key.ip]: used - 1 } },
    key.day,
  );
}

/** 当前用量（只读，给 /api/quota 用） */
export function usedQuota(key: QuotaKey): number {
  return readStore()[key.day]?.[key.ip] ?? 0;
}
