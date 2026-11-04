/**
 * 当前访客的额度状态 —— 给界面显示「每天 N 次 / 今天还剩几次」。
 *
 * 只读，不计数。
 */

import { askQuotaKey, dailyLimit, usedQuota } from '@/lib/askQuota';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = await askQuotaKey();
  const limit = dailyLimit();
  const used = usedQuota(key);
  return Response.json(
    { limit, used, remaining: Math.max(0, limit - used) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
