import fs from 'node:fs';
import path from 'node:path';
import { bumpQuota, type QuotaStore } from './quota';

/**
 * 每日额度的**落盘层**（无 next 依赖，纯 fs）。
 *
 * 计数口径：**UTC 日 + 归属桶**（bucket）。
 *   · `ip:<addr>` —— 未登录访客，按 IP 每天 N 次
 *   · `u:<userId>` —— 已登录用户，按账户每天 N 次（与 IP 计数**分开**）
 *
 * 计数文件 `.data/ask-quota.json` 只保留当天（UTC），文件不无限涨，重启不丢。
 * 纯逻辑（判定 / 递增）在 lib/quota.ts，这里只管读写。
 *
 * 目录可用 `ZIWEI_STATE_DIR` 覆盖（生产挂卷、本地测试指到临时目录）。
 * ponytail: 单机单进程够用（读写同步 fs，进程内原子）；多实例部署换 Redis 再说。
 */

/** 状态目录：env 优先，默认进程 cwd 下的 .data */
export function stateDir(): string {
  const env = process.env.ZIWEI_STATE_DIR?.trim();
  return env || path.join(process.cwd(), '.data');
}

/** 额度计数文件 */
export function quotaFile(): string {
  return path.join(stateDir(), 'ask-quota.json');
}

/** UTC 日（00:00 UTC 刷新） */
export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** 归属桶：按 IP */
export function bucketIp(ip: string): string {
  return `ip:${ip}`;
}

/** 归属桶：按账户 */
export function bucketUser(userId: string): string {
  return `u:${userId}`;
}

function read(): QuotaStore {
  try {
    const v = JSON.parse(fs.readFileSync(quotaFile(), 'utf8')) as QuotaStore;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** 只保留当天（UTC）的计数，文件不无限涨 */
function write(store: QuotaStore, day: string): void {
  const file = quotaFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ [day]: store[day] ?? {} }));
}

/** 某桶今天已用几次 */
export function usedIn(bucket: string, day: string = utcDay()): number {
  return read()[day]?.[bucket] ?? 0;
}

/**
 * 占一次 —— 到限返回 null（不计数），成功返回剩余次数。
 * 「先占后还」的第一步：提问前原子占一次。
 */
export function bump(
  bucket: string,
  day: string = utcDay(),
  limit: number,
): { remaining: number } | null {
  const store = read();
  const r = bumpQuota(store, day, bucket, limit);
  if (!r) return null;
  write(r.store, day);
  return { remaining: r.remaining };
}

/** 退还一次占用 —— 请求失败时调用（provider 报错 / 样本库未覆盖） */
export function refund(bucket: string, day: string = utcDay()): void {
  const store = read();
  const used = store[day]?.[bucket] ?? 0;
  if (used <= 0) return;
  write({ ...store, [day]: { ...store[day], [bucket]: used - 1 } }, day);
}
