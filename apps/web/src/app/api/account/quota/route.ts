/**
 * 「我的额度」数据 —— GET
 *
 * 免费日额剩余 + 流量包余额 + 最近订单。未登录返回 401。
 */

import { accountQuota, listOrders } from '@/lib/account';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: 'NOT_LOGGED_IN' }, { status: 401 });
  }
  return Response.json(
    {
      ok: true,
      email: user.email,
      quota: accountQuota(user.id),
      orders: listOrders(user.id),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
