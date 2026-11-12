/**
 * 问卷墙入口 —— 登录用户拿 CPX iframe URL。
 *
 * secret 不出服务端：前端只拿拼好的 wallUrl。
 * 未配置 CPX env → 503（前端据此隐藏入口；国内实例的正常状态）。
 */

import { cpxConfigured, cpxWallUrl } from '@/lib/cpx';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return Response.json({ ok: false, error: 'NOT_LOGGED_IN' }, { status: 401 });
  }
  if (!cpxConfigured()) {
    return Response.json({ ok: false, error: 'SURVEY_NOT_CONFIGURED' }, { status: 503 });
  }
  return Response.json(
    { ok: true, wallUrl: cpxWallUrl(user) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
