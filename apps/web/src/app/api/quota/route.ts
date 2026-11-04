/**
 * 当前访客的额度状态 —— 给界面显示「每天 N 次 / 今天还剩几次」。
 *
 * 只读，不计数。
 * 已登录按 userId 计（与 IP 分开），未登录按 IP 计。
 */

import { requestIp, snapshotFor, type QuotaSubject } from '@/lib/askAccess';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  const subject: QuotaSubject = user
    ? { kind: 'user', userId: user.id }
    : { kind: 'ip', ip: await requestIp() };
  const s = snapshotFor(subject);
  return Response.json(
    { ...s, loggedIn: Boolean(user) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
