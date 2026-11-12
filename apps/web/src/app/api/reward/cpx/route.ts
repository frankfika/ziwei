/**
 * CPX postback —— 问卷完成后 CPX 服务端回调发奖。
 *
 * 链路：验签 → 用户存在 → 幂等台账 → 加流量包余额（与购买同池）。
 * 重复回调回 200 但不重复发奖（CPX 重试机制常见，幂等是红线）。
 *
 * ponytail: 参数名（tx/uid/usd/sig）以 CPX 后台 Postback Settings-Tab 为准，
 * 拿到账号标定首个真实回调；验签公式在 lib/cpx.ts 单点维护。
 */

import { addPackBalance, getUserById, recordCpxTx } from '@/lib/account';
import { asksFromPayout, verifyCpxPostback } from '@/lib/cpx';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const p = {
    tx: url.searchParams.get('tx') ?? '',
    uid: url.searchParams.get('uid') ?? '',
    usd: Number(url.searchParams.get('usd') ?? 0),
    sig: url.searchParams.get('sig') ?? '',
  };

  if (!verifyCpxPostback(p)) {
    console.warn('[cpx] postback rejected:', p);
    return new Response('0', { status: 403 });
  }

  const user = getUserById(p.uid);
  if (!user) {
    console.warn('[cpx] postback for unknown user:', p.uid);
    return new Response('0', { status: 404 });
  }

  const asks = asksFromPayout(p.usd);
  if (asks <= 0 || !recordCpxTx(p.tx, p.uid, asks)) {
    // asks=0（金额异常）或重复回调：不回错误（避免 CPX 无限重试），只是不加
    return new Response('1', { status: 200 });
  }

  addPackBalance(p.uid, asks);
  console.log(`[cpx] credited ${asks} asks to ${p.uid} (tx ${p.tx}, $${p.usd})`);
  return new Response('1', { status: 200 });
}
