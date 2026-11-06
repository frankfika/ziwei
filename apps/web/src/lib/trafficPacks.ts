/**
 * 流量包（占位套餐）—— 覆盖内置追问的 token 消耗。
 *
 * ⚠️ **占位数据**：价格与额度都是待 Fang 最终拍板的占位值；
 * 接入真实支付前，只有下单 stub（见 /api/checkout），不产生任何真实交易。
 *
 * 用户自备 Key 仍然不限量 —— 流量包只针对「站内内置 AI」的免费额度。
 */

import { alipayConfigured } from './alipay';

/** 流量包 checkout stub 的路径（POST { packId }） */
export const CHECKOUT_PATH = '/api/checkout';

export interface TrafficPack {
  /** 稳定 id，用于下单 stub */
  id: string;
  /** 额外可追问次数 */
  asks: number;
  /** 人民币标价 */
  priceCny: number;
  /** 美元标价 */
  priceUsd: number;
}

/** 占位套餐表 —— 待 Fang 定稿 */
export const TRAFFIC_PACKS: TrafficPack[] = [
  { id: 'pack-20', asks: 20, priceCny: 6, priceUsd: 0.99 },
  { id: 'pack-100', asks: 100, priceCny: 25, priceUsd: 3.99 },
  { id: 'pack-500', asks: 500, priceCny: 99, priceUsd: 14.99 },
];

/** 按 id 找套餐；找不到返回 undefined */
export function findPack(id: string): TrafficPack | undefined {
  return TRAFFIC_PACKS.find((p) => p.id === id);
}

/** 额度墙里给用户看的「流量包入口」——随 API 一起下发，前端不用再问一次 */
export interface PackEntry {
  /** 可选套餐 */
  packs: TrafficPack[];
  /** 下单 stub 的路径 */
  checkout: string;
}

/**
 * 构造流量包入口（服务端下发给前端用）。
 *
 * 支付没配好（商户凭据缺失 / 暂不开放购买）时**不下发任何套餐** ——
 * 额度墙只讲免费额度，不摆一排点了只会报错的购买按钮。
 */
export function packEntry(): PackEntry {
  if (!alipayConfigured()) return { packs: [], checkout: CHECKOUT_PATH };
  return { packs: TRAFFIC_PACKS, checkout: CHECKOUT_PATH };
}
