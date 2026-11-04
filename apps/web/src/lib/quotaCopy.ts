/**
 * 额度相关文案（中英）。
 *
 * 只覆盖「额度墙 / 用尽提示 / 流量包入口 / 每天 N 次」这几处 —— 全站 i18n 不在本次范围。
 * 文案与代码分离：加一句话只改这里，不动组件逻辑。
 */

import type { TrafficPack } from './trafficPacks';

export type Lang = 'zh' | 'en';

export interface QuotaCopy {
  /** 「本站免费提供 · 每天 N 次」的小注 */
  dailyNote: (limit: number) => string;
  /** AI 状态行（内置免费） */
  statusBuiltin: (model: string, limit: number) => string;
  /** AI 状态行（用户自己的 Key） */
  statusUser: (model: string) => string;
  /** 状态行后面的提示（换个 Key 之类） */
  statusHint: string;
  /** 用自己的 Key 时的状态行提示 */
  statusHintUser: string;
  /** AI 设置面板里的「当前 AI」行 */
  activeBuiltin: (model: string, limit: number) => string;
  activeUser: (model: string) => string;
  /** 额度墙标题 */
  wallTitle: string;
  /** 额度墙正文 */
  wallBody: (limit: number) => string;
  /** 流量包区块标题 */
  packsTitle: string;
  /** 套餐名（n 次追问） */
  packAsks: (n: number) => string;
  /** 购买按钮 */
  buy: string;
  /** 引导去填自己的 Key */
  ownKeyHint: string;
  /** 支付未开通（stub）提示 */
  payStub: string;
  /** 语言切换按钮 */
  langToggle: (lang: Lang) => string;
}

const ZH: QuotaCopy = {
  dailyNote: (n) => `（本站免费提供 · 每天 ${n} 次）`,
  statusBuiltin: (model, n) => `当前 AI：${model}（本站免费提供 · 每天 ${n} 次）`,
  statusUser: (model) => `当前 AI：${model}（你的 Key · 不限量）`,
  statusHint: '—— 右上角 ⚙ 可换成自己的 Key。',
  statusHintUser: '—— 右上角 ⚙ 可更换或测试。',
  activeBuiltin: (model, n) => `当前 AI：${model}（本站免费提供 · 每天 ${n} 次）`,
  activeUser: (model) => `当前 AI：${model}（你的 Key · 不限量）`,
  wallTitle: '今天的免费追问额度用完了',
  wallBody: (n) =>
    `内置 AI 每个 IP 每天免费 ${n} 次，次日 0 点（UTC）刷新。也可以填自己的 API Key，或买一个流量包继续问。`,
  packsTitle: '流量包',
  packAsks: (n) => `${n} 次追问`,
  buy: '购买',
  ownKeyHint: '填自己的 API Key 不限量 —— 点右上角 ⚙ AI 设置。',
  payStub: '支付尚未开通（第一期 stub），先记下意向。',
  langToggle: (l) => (l === 'zh' ? 'EN' : '中文'),
};

const EN: QuotaCopy = {
  dailyNote: (n) => `(free on-site AI · ${n} per day)`,
  statusBuiltin: (model, n) => `Current AI: ${model} (free on-site AI · ${n} per day)`,
  statusUser: (model) => `Current AI: ${model} (your key · unlimited)`,
  statusHint: '— switch to your own key via ⚙, top right.',
  statusHintUser: '— replace or test it via ⚙, top right.',
  activeBuiltin: (model, n) => `Current AI: ${model} (free on-site AI · ${n} per day)`,
  activeUser: (model) => `Current AI: ${model} (your key · unlimited)`,
  wallTitle: "You've used today's free follow-ups",
  wallBody: (n) =>
    `The built-in AI allows ${n} free follow-ups per IP per day, resetting at 00:00 UTC. Add your own API key, or buy a traffic pack to keep asking.`,
  packsTitle: 'Traffic packs',
  packAsks: (n) => `${n} follow-ups`,
  buy: 'Buy',
  ownKeyHint: 'Use your own API key for unlimited asks — ⚙ AI settings, top right.',
  payStub: 'Payments are not live yet (phase-1 stub) — we noted your interest.',
  langToggle: (l) => (l === 'zh' ? '中文' : 'EN'),
};

export const QUOTA_COPY: Record<Lang, QuotaCopy> = { zh: ZH, en: EN };

/** 套餐展示名（中文界面） */
export function packName(pack: TrafficPack, copy: QuotaCopy): string {
  return copy.packAsks(pack.asks);
}
