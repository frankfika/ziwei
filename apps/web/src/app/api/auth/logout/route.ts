/**
 * 注销 —— POST
 *
 * 删服务端会话 + 清 cookie。
 */

import { cookies } from 'next/headers';

import { destroySession } from '@/lib/account';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  destroySession(token);
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
