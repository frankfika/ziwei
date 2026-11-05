/**
 * 支付状态轮询 —— GET ?orderId=…
 *
 * 前端买完包每 3 秒问一次；这里向支付宝查单（alipay.trade.query）拿权威结果，
 * TRADE_SUCCESS 才把订单置 paid 并加额度（幂等，重复轮询只入账一次）。
 * 校验订单归属：只能查自己的单。
 */

import { getOrder, markOrderClosed, markOrderPaid } from '@/lib/account';
import { alipayQuery } from '@/lib/alipay';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const orderId = new URL(request.url).searchParams.get('orderId')?.trim() ?? '';
  if (!orderId) {
    return Response.json({ ok: false, error: 'MISSING_ORDER' }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: 'NOT_LOGGED_IN' }, { status: 401 });

  const order = getOrder(orderId);
  if (!order || order.userId !== user.id) {
    return Response.json({ ok: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }
  if (order.status === 'paid' || order.status === 'stub') {
    return Response.json({ ok: true, status: 'paid', asks: order.asks });
  }
  if (order.status === 'closed') {
    return Response.json({ ok: true, status: 'closed' });
  }

  const q = await alipayQuery(order.id);
  if (q.status === 'paid') {
    markOrderPaid(order.id, q.tradeNo);
    return Response.json({ ok: true, status: 'paid', asks: order.asks });
  }
  if (q.status === 'closed') {
    markOrderClosed(order.id);
    return Response.json({ ok: true, status: 'closed' });
  }
  if (q.status === 'error') {
    return Response.json({ ok: false, error: 'QUERY_FAILED', detail: q.error }, { status: 502 });
  }
  return Response.json({ ok: true, status: 'waiting' });
}
