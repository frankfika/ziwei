/**
 * 支付宝「当面付」客户端 —— 网页生成二维码，用户支付宝扫码付款。
 *
 * 依赖零包：RSA2 签名/验签用 Node 自带 crypto。需要配置（缺一不可）：
 *   ZIWEI_ALIPAY_APP_ID         开放平台应用的 app_id
 *   ZIWEI_ALIPAY_PRIVATE_KEY    商户私钥（PKCS8，应用私钥）
 *   ZIWEI_ALIPAY_PUBLIC_KEY     支付宝公钥（开放平台「接口加签方式」里查看，用于验签响应）
 * 可选：
 *   ZIWEI_ALIPAY_GATEWAY        网关，默认正式环境；沙箱测试用
 *                               https://openapi-sandbox.dl.alipaydev.com/gateway.do
 *
 * 收款口径：下单（alipay.trade.precreate）出二维码 → 前端轮询
 * /api/pay/status → 服务端查单（alipay.trade.query），TRADE_SUCCESS 才加额度。
 * 不依赖 notify 回调（公网地址不满足时也能用），查单本身就是权威确认。
 */

import crypto from 'node:crypto';

export interface AlipayConfig {
  appId: string;
  privateKey: string;
  alipayPublicKey: string;
  gateway: string;
}

export function alipayConfigured(): boolean {
  return Boolean(
    process.env.ZIWEI_ALIPAY_APP_ID?.trim() &&
      process.env.ZIWEI_ALIPAY_PRIVATE_KEY?.trim() &&
      process.env.ZIWEI_ALIPAY_PUBLIC_KEY?.trim(),
  );
}

function config(): AlipayConfig {
  return {
    appId: process.env.ZIWEI_ALIPAY_APP_ID!.trim(),
    privateKey: normalizePem(process.env.ZIWEI_ALIPAY_PRIVATE_KEY!.trim(), 'PRIVATE KEY'),
    alipayPublicKey: normalizePem(process.env.ZIWEI_ALIPAY_PUBLIC_KEY!.trim(), 'PUBLIC KEY'),
    gateway:
      process.env.ZIWEI_ALIPAY_GATEWAY?.trim() || 'https://openapi.alipay.com/gateway.do',
  };
}

/** 环境变量里的密钥可能是单行 base64，也可能带字面 \n —— 统一成 PEM */
function normalizePem(raw: string, label: string): string {
  const body = raw.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/** GMT+8 的 yyyy-MM-dd HH:mm:ss —— 支付宝接口要求 */
function alipayNow(): string {
  const d = new Date(Date.now() + 8 * 3600_000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** 公共参数 + biz_content 签名并发起请求，返回（已验签的）业务响应对象 */
async function callApi(
  method: string,
  bizContent: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cfg = config();
  const params: Record<string, string> = {
    app_id: cfg.appId,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: alipayNow(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  };

  const signContent = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signContent);
  params.sign = signer.sign(cfg.privateKey, 'base64');

  const res = await fetch(cfg.gateway, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    throw new Error(`支付宝网关 HTTP ${res.status}`);
  }
  const data = (await res.json()) as Record<string, Record<string, unknown> | string>;
  const payload = data[method.replace(/\./g, '_') + '_response'];
  if (!payload || typeof payload === 'string') {
    throw new Error('支付宝响应缺少业务数据');
  }

  // 验签：业务响应对象原样 stringify（保持 JSON 键序）后用支付宝公钥校验
  const sign = String(data.sign ?? '');
  const ok = crypto
    .createVerify('RSA-SHA256')
    .update(JSON.stringify(payload))
    .verify(cfg.alipayPublicKey, sign, 'base64');
  if (!ok) {
    throw new Error('支付宝响应验签失败 —— 请检查 ZIWEI_ALIPAY_PUBLIC_KEY 是否为「支付宝公钥」');
  }
  return payload;
}

export type PrecreateResult =
  | { ok: true; qrCode: string }
  | { ok: false; error: string };

/** 预下单：出收款二维码（当面付 alipay.trade.precreate） */
export async function alipayPrecreate(input: {
  outTradeNo: string;
  /** 金额（元），两位小数 */
  totalAmount: string;
  subject: string;
}): Promise<PrecreateResult> {
  try {
    const payload = await callApi('alipay.trade.precreate', {
      out_trade_no: input.outTradeNo,
      total_amount: input.totalAmount,
      subject: input.subject,
    });
    if (payload.code !== '10000') {
      return {
        ok: false,
        error: `支付宝预下单失败 ${payload.code ?? ''} ${payload.sub_msg ?? payload.msg ?? ''}`.trim(),
      };
    }
    const qr = payload.qr_code;
    return typeof qr === 'string' && qr
      ? { ok: true, qrCode: qr }
      : { ok: false, error: '支付宝未返回二维码' };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type QueryResult =
  | { status: 'paid'; tradeNo: string }
  | { status: 'waiting' }
  | { status: 'closed' }
  | { status: 'error'; error: string };

/** 查单（alipay.trade.query）—— 支付成功与否的权威判断 */
export async function alipayQuery(outTradeNo: string): Promise<QueryResult> {
  try {
    const payload = await callApi('alipay.trade.query', { out_trade_no: outTradeNo });
    // 40004 = 交易不存在 —— 用户还没扫码，属正常等待
    if (payload.code === '40004') return { status: 'waiting' };
    if (payload.code !== '10000') {
      return { status: 'error', error: `查单失败 ${payload.code ?? ''} ${payload.sub_msg ?? payload.msg ?? ''}`.trim() };
    }
    if (payload.trade_status === 'TRADE_SUCCESS' || payload.trade_status === 'TRADE_FINISHED') {
      return { status: 'paid', tradeNo: String(payload.trade_no ?? '') };
    }
    if (payload.trade_status === 'TRADE_CLOSED') return { status: 'closed' };
    return { status: 'waiting' };
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
}
