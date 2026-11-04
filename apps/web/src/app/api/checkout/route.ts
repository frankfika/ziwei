/**
 * 流量包下单 **stub** —— 第一期不接真实支付。
 *
 * 但**额度是真的**：下单成功就把该套餐的追问次数加到登录账户的 packBalance 上，
 * 否则「购买」只是个空壳，用户余额纹丝不动。
 *
 * 必须登录 —— 未登录返回 401（前端据此引导登录，不加额度）。
 */

import { addPackBalance, createOrder } from '@/lib/account';
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
    // 未登录不能买 —— 明确拒绝，不落单、不加额度
    return Response.json({ ok: false, error: 'NOT_LOGGED_IN' }, { status: 401 });
  }

  const order = createOrder(user.id, pack);
  const updated = addPackBalance(user.id, pack.asks);

  // 文案由前端 QUOTA_COPY 负责（要中英），服务端不写死中文
  return Response.json({
    ok: true,
    stub: true,
    orderId: order.id,
    packId: pack.id,
    asks: pack.asks,
    packBalance: updated.packBalance,
  });
}
