/**
 * 流量包下单 **stub** —— 第一期不接真实支付。
 *
 * 只做两件事：校验套餐 id、记一条意向并回一句人话。
 * **不收款、不发货、不加额度** —— 真接支付时替换这个文件即可，前端契约不变。
 */

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

  // ponytail: stub —— 真实支付接入前只回执，不落库、不加额度
  // 文案由前端 QUOTA_COPY 负责（要中英），服务端不写死中文
  return Response.json({
    ok: true,
    stub: true,
    packId: pack.id,
    asks: pack.asks,
  });
}
