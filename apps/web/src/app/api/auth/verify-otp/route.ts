/**
 * 校验邮箱验证码并登录 —— POST { email, code }
 *
 * 成功：Set-Cookie（httpOnly + SameSite=Lax + Secure(生产)），返回 { ok:true, email }。
 */

import { cookies } from 'next/headers';

import { createSession, ensureUser, isValidEmail, normalizeEmail, verifyOtp } from '@/lib/account';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let email = '';
  let code = '';
  try {
    const body = (await request.json()) as { email?: unknown; code?: unknown };
    if (typeof body.email === 'string') email = normalizeEmail(body.email);
    if (typeof body.code === 'string') code = body.code.trim();
  } catch {
    /* body 不是 JSON */
  }

  if (!email || !isValidEmail(email) || !code) {
    return Response.json({ ok: false, error: 'INVALID_INPUT' }, { status: 400 });
  }

  if (!verifyOtp(email, code)) {
    return Response.json({ ok: false, error: 'INVALID_CODE' }, { status: 400 });
  }

  const user = ensureUser(email);
  const session = createSession(user.id);

  const store = await cookies();
  store.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });

  return Response.json({ ok: true, email: user.email });
}
