/**
 * 请求邮箱验证码 —— POST { email }
 *
 * 成功返回 { ok:true }；调试模式（未配发信通道 + 开发环境）额外带 debugCode。
 * 限流：同邮箱 60 秒 1 次、每天 20 次。
 */

import { isValidEmail, issueOtp, normalizeEmail, otpRateLimit } from '@/lib/account';
import { sendOtpEmail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let email = '';
  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email === 'string') email = normalizeEmail(body.email);
  } catch {
    /* body 不是 JSON */
  }

  if (!email || !isValidEmail(email)) {
    return Response.json({ ok: false, error: 'INVALID_EMAIL' }, { status: 400 });
  }

  const wait = otpRateLimit(email);
  if (wait !== null) {
    return Response.json(
      { ok: false, error: 'RATE_LIMITED', retryAfter: wait },
      { status: 429 },
    );
  }

  const { code } = issueOtp(email);
  const sent = await sendOtpEmail(email, code);
  if (!sent.ok) {
    // 生产未配发信通道 —— 明确报错，不静默
    return Response.json({ ok: false, error: sent.error }, { status: 503 });
  }

  return Response.json({
    ok: true,
    ...(sent.debugCode ? { debugCode: sent.debugCode } : {}),
  });
}
