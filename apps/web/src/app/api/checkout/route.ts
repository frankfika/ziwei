/**
 * 流量包下单 —— 真实支付（支付宝当面付）。
 *
 * 流程：登录 → 选套餐 → 服务端建 pending 订单 → 调支付宝预下单拿二维码
 * → 前端展示二维码 + 轮询 /api/pay/status → 支付宝侧确认 TRADE_SUCCESS 才加额度。
 *
 * 未配置支付宝商户凭据时明确返回 503（不再有「不收钱直接加额度」的 stub）。
 * 必须登录 —— 未登录返回 401（前端据此引导登录）。
 */

import { createOrder } from '@/lib/account';
import { alipayConfigured, alipayPrecreate } from '@/lib/alipay';
import { currentUser } from '@/lib/session';
import { findPack } from '@/lib/trafficPacks';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let packId = '';
  try {
    const body = (await request.json()) as { packId?: unknown };
    if (typeof body.packId === 'string') packId = body.packId;
  } catch {
    /* body 不是 JSON —— 当作没传 */
  }

  const pack = findPack(packId);
  if (!pack) {
    return Response.json({ ok: false, error: 'UNKNOWN_PACK' }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) {
    // 未登录不能买 —— 明确拒绝，不落单
    return Response.json({ ok: false, error: 'NOT_LOGGED_IN' }, { status: 401 });
  }

  if (!alipayConfigured()) {
    return Response.json({ ok: false, error: 'PAYMENT_NOT_CONFIGURED' }, { status: 503 });
  }

  const order = createOrder(user.id, pack);
  const pre = await alipayPrecreate({
    outTradeNo: order.id,
    totalAmount: pack.priceCny.toFixed(2),
    subject: `紫微助手流量包 ${pack.asks} 次`,
  });
  if (!pre.ok) {
    return Response.json({ ok: false, error: 'PRECREATE_FAILED', detail: pre.error }, { status: 502 });
  }

  // 二维码在服务端转成 data URL，前端 <img> 直接显示，不用引 QR 库
  const { default: QRCode } = await import('qrcode');
  const qrDataUrl = await QRCode.toDataURL(pre.qrCode, { margin: 1, width: 240 });

  return Response.json({
    ok: true,
    orderId: order.id,
    packId: pack.id,
    asks: pack.asks,
    priceCny: pack.priceCny,
    qrDataUrl,
  });
}
