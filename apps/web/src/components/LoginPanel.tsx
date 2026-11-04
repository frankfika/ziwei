'use client';

/**
 * 邮箱验证码登录 —— 弹层 / 内嵌都能用。
 *
 * 两步：先发码（POST /api/auth/request-otp），再校验（POST /api/auth/verify-otp）。
 * 校验成功后服务端 Set-Cookie，前端不用管 token（httpOnly）。
 *
 * 本地没配发信通道时，接口会回 debugCode，这里直接显示出来（开发环境才可能）。
 */

import { useState } from 'react';
import { QUOTA_COPY } from '@/lib/quotaCopy';
import { useLang } from '@/lib/lang';

export default function LoginPanel({
  onSuccess,
  compact = false,
}: {
  /** 登录成功后回调（用来刷新额度 / 关闭弹层） */
  onSuccess?: () => void;
  /** 紧凑排版（额度墙里用） */
  compact?: boolean;
}) {
  const [lang] = useLang();
  const copy = QUOTA_COPY[lang];
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setErr(null);
    // 注意：不清 msg —— 重发被限流时，上一次成功发出的验证码还显示在页面上，不能抹掉
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        debugCode?: string;
        retryAfter?: number;
      } | null;
      if (!res.ok || !j?.ok) {
        // 发送失败 ≠ 码错了：按实际原因给文案，别拿「验证码无效」吓用户
        if (j?.error === 'RATE_LIMITED') {
          setErr(copy.sendRateLimited(j.retryAfter ?? 0));
        } else {
          setErr(copy.sendFailed);
        }
        return;
      }
      setDebugCode(j.debugCode ?? null);
      setMsg(copy.codeSent);
      setPhase('code');
    } catch {
      setErr(copy.loginError);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!res.ok || !j?.ok) {
        setErr(copy.loginError);
        return;
      }
      setMsg(copy.loginOk);
      onSuccess?.();
    } catch {
      setErr(copy.loginError);
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    'min-h-9 w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-ink-3/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu';

  return (
    <div className={compact ? '' : 'rounded-xl border border-line bg-surface-2 px-4 py-4'}>
      <p className="text-sm font-medium text-ink">{copy.loginTitle}</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-2">{copy.loginHint}</p>

      <label className="mt-3 block text-2xs text-ink-2" htmlFor="ziwei-login-email">
        {copy.emailLabel}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="ziwei-login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.emailPlaceholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={sendCode}
          disabled={busy || !email.trim()}
          className="min-h-9 shrink-0 rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-1.5 text-xs text-zhu transition-colors hover:bg-zhu-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.sendCode}
        </button>
      </div>

      {phase === 'code' && (
        <>
          <label className="mt-3 block text-2xs text-ink-2" htmlFor="ziwei-login-code">
            {copy.codeLabel}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="ziwei-login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={copy.codePlaceholder}
              className={inputClass}
            />
            <button
              type="button"
              onClick={verify}
              disabled={busy || code.trim().length < 6}
              className="min-h-9 shrink-0 rounded-lg border border-zhu/30 bg-zhu-soft/60 px-3 py-1.5 text-xs text-zhu transition-colors hover:bg-zhu-soft disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.verifyLogin}
            </button>
          </div>
        </>
      )}

      {msg && (
        <p className="mt-2 text-2xs text-ink-2" role="status">
          {msg}
          {debugCode && <span className="ml-1 text-zhu">{copy.debugCode(debugCode)}</span>}
        </p>
      )}
      {err && (
        <p className="mt-2 text-2xs text-red-600" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
