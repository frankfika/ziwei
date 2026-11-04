/**
 * 当前登录状态 —— GET
 *
 * 未登录返回 { loggedIn:false }；已登录带邮箱与账户额度摘要。
 */

import { accountQuota } from '@/lib/account';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return Response.json({ loggedIn: false }, { headers: { 'cache-control': 'no-store' } });
  }
  return Response.json(
    {
      loggedIn: true,
      email: user.email,
      quota: accountQuota(user.id),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
