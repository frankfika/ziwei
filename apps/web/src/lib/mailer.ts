/**
 * 验证码邮件发送 —— 第一期只有 Resend 一种通道。
 *
 * 配置 `ZIWEI_RESEND_API_KEY`（可选 `ZIWEI_RESEND_FROM`）时发真邮件；
 * **未配置**时：
 *   · 开发环境（NODE_ENV=development）或显式 `ZIWEI_OTP_DEBUG=1`
 *     → 不发信，把验证码放进响应（debugCode）并写日志，本地可测；
 *   · 生产环境未配置 → 明确报错「邮件服务未配置」，不静默吞掉。
 *
 * ponytail: 只接 Resend；以后要 SMTP 再加一个通道（接口不变）。
 */

/** 发送结果 */
export type SendResult =
  | { ok: true; /** 本地调试模式：验证码明文回给调用方 */ debugCode?: string }
  | { ok: false; error: string };

/** 是否跑在「不发信」的调试模式 */
export function debugMode(): boolean {
  return (
    process.env.ZIWEI_OTP_DEBUG === '1' ||
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test'
  );
}

/** 生产环境没配发信通道 —— 明确报错，不静默 */
export function mailConfigured(): boolean {
  return Boolean(process.env.ZIWEI_RESEND_API_KEY?.trim());
}

/**
 * 发验证码邮件。
 *
 * @param email 收件邮箱
 * @param code  6 位验证码
 */
export async function sendOtpEmail(email: string, code: string): Promise<SendResult> {
  const key = process.env.ZIWEI_RESEND_API_KEY?.trim();
  const from = process.env.ZIWEI_RESEND_FROM?.trim() || '紫微助手 <onboarding@resend.dev>';

  if (!key) {
    if (debugMode()) {
      console.log(`[otp] 调试模式：${email} 的验证码是 ${code}（未配置发信通道，未实际发送）`);
      return { ok: true, debugCode: code };
    }
    return { ok: false, error: '邮件服务未配置' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: '紫微助手登录验证码',
        text: `你的验证码是 ${code}，10 分钟内有效。如果不是你自己操作，忽略这封信。`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[otp] 发信失败 HTTP ${res.status}：${detail.slice(0, 300)}`);
      return { ok: false, error: '验证码邮件发送失败，请稍后重试' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[otp] 发信异常：', err);
    return { ok: false, error: '验证码邮件发送失败，请稍后重试' };
  }
}
