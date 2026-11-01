import fs from 'node:fs';
import path from 'node:path';
import { headers } from 'next/headers';

/**
 * 服务端默认 AI 的每日限额 —— 没自配 Key 的访客每天每 IP 限 DAILY_LIMIT 次。
 * 计数落盘 .data/ask-quota.json（只留当天，文件不无限涨），重启不丢。
 * ponytail: 单机单进程够用；多实例部署换 Redis 之类再說。
 */

export const DAILY_LIMIT = 10;

const STORE = path.join(process.cwd(), '.data', 'ask-quota.json');

type Store = Record<string, Record<string, number>>;

/** 纯函数：给 (day, ip) 记一次，返回剩余次数；到限返回 null（store 不变） */
export function bumpQuota(
  store: Store,
  day: string,
  ip: string,
  limit = DAILY_LIMIT,
): { store: Store; remaining: number } | null {
  const used = store[day]?.[ip] ?? 0;
  if (used >= limit) return null;
  const next: Store = { [day]: { ...store[day], [ip]: used + 1 } };
  return { store: next, remaining: limit - used - 1 };
}

function readStore(): Store {
  try {
    const v = JSON.parse(fs.readFileSync(STORE, 'utf8')) as Store;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

async function dayAndIp(): Promise<{ day: string; ip: string }> {
  const h = await headers();
  const ip = (
    h.get('x-forwarded-for')?.split(',')[0] ??
    h.get('x-real-ip') ??
    'unknown'
  ).trim();
  return { day: new Date().toISOString().slice(0, 10), ip };
}

const exceeded = () => ({
  ok: false as const,
  message: `每日免费体验限 ${DAILY_LIMIT} 次，已到上限。点「⚙ AI 设置」填自己的 API Key 后不限量，明天额度也会刷新。`,
});

/** 提问前只读检查：到限给访客一句人话，不计数 */
export async function checkAskQuota(): Promise<
  { ok: true; remaining: number } | { ok: false; message: string }
> {
  const { day, ip } = await dayAndIp();
  const used = readStore()[day]?.[ip] ?? 0;
  return used >= DAILY_LIMIT ? exceeded() : { ok: true, remaining: DAILY_LIMIT - used };
}

/** 回答成功后才计数；到限不硬拦（这次已经花了模型钱，照样给） */
export async function consumeAskQuota(): Promise<void> {
  const { day, ip } = await dayAndIp();
  const r = bumpQuota(readStore(), day, ip);
  if (!r) return;
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(r.store));
}
