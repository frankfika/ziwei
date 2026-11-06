/**
 * 追问额度（第一期）—— 纯逻辑回归。
 *
 * 覆盖三件事：
 *  1. 每日上限默认 3，env 覆盖生效，非法值回落默认
 *  2. 计数口径：成功 3 次后第 4 次被墙；失败退还后还能再问（失败不扣次）
 *  3. 流量包占位套餐齐全，checkout 入口存在
 *
 * 只测纯函数层（apps/web/src/lib/quota.ts、trafficPacks.ts）——
 * 服务端落盘那层要 fs + next/headers，不进单测。
 */

import assert from 'node:assert/strict';

import {
  DAILY_LIMIT,
  bumpQuota,
  parseVipEntries,
  resolveDailyLimit,
  resolveVipLimit,
  type QuotaStore,
} from '../apps/web/src/lib/quota';
import {
  TRAFFIC_PACKS,
  findPack,
  packEntry,
} from '../apps/web/src/lib/trafficPacks';

import type { Tester } from './harness';

/** 固定一天 + 一个 IP（UTC 日口径） */
const DAY = '2026-11-04';
const IP = '203.0.113.7';

/** 模拟一次「成功提问」：占一次额度 */
function ask(
  store: QuotaStore,
  limit = DAILY_LIMIT,
): { store: QuotaStore; remaining: number } | null {
  const r = bumpQuota(store, DAY, IP, limit);
  return r ? { store: r.store, remaining: r.remaining } : null;
}

/** 模拟一次「失败退还」：把当天的计数减回去 */
function refund(store: QuotaStore): QuotaStore {
  const used = store[DAY]?.[IP] ?? 0;
  if (used <= 0) return store;
  return { ...store, [DAY]: { ...store[DAY], [IP]: used - 1 } };
}

export const suite = async (t: Tester): Promise<void> => {
  await t.test('默认每日上限是 3', () => {
    assert.equal(DAILY_LIMIT, 3);
    assert.equal(resolveDailyLimit(undefined), 3);
    assert.equal(resolveDailyLimit(''), 3);
  });

  await t.test('VIP：名单解析（逗号/换行分隔、大小写、去空）', () => {
    assert.deepEqual(parseVipEntries(' A@B.com , 0123abcdef\n'), ['a@b.com', '0123abcdef']);
    assert.deepEqual(parseVipEntries(''), []);
    assert.deepEqual(parseVipEntries(undefined), []);
  });

  await t.test('VIP：日额 0/缺省 = 不限量，非法值也按不限量', () => {
    assert.equal(resolveVipLimit(undefined), 0);
    assert.equal(resolveVipLimit(''), 0);
    assert.equal(resolveVipLimit('0'), 0);
    assert.equal(resolveVipLimit('10'), 10);
    assert.equal(resolveVipLimit('abc'), 0);
    assert.equal(resolveVipLimit('-3'), 0);
  });

  await t.test('env 覆盖生效；非法值回落默认', () => {
    assert.equal(resolveDailyLimit('10'), 10);
    assert.equal(resolveDailyLimit(' 5 '), 5);
    assert.equal(resolveDailyLimit('2.7'), 2);
    assert.equal(resolveDailyLimit('0'), DAILY_LIMIT);
    assert.equal(resolveDailyLimit('-1'), DAILY_LIMIT);
    assert.equal(resolveDailyLimit('abc'), DAILY_LIMIT);
  });

  await t.test('无 Key：成功 3 次后第 4 次被墙', () => {
    let store: QuotaStore = {};
    const remaining: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = ask(store);
      assert.ok(r, `第 ${i + 1} 次应当放行`);
      store = r!.store;
      remaining.push(r!.remaining);
    }
    assert.deepEqual(remaining, [2, 1, 0]);
    assert.equal(ask(store), null, '第 4 次应当被墙');
  });

  await t.test('失败不扣次：退还后还能再问', () => {
    let store: QuotaStore = {};
    for (let i = 0; i < 3; i++) store = ask(store)!.store;
    assert.equal(ask(store), null, '用满后被墙');

    // 一次失败 → 退还一次
    store = refund(store);
    const r = ask(store);
    assert.ok(r, '退还后应当能再问一次');
    store = r!.store;
    assert.equal(store[DAY][IP], 3);
    assert.equal(ask(store), null, '再次用满后仍被墙');
  });

  await t.test('不同 IP 各自计数；换日重置', () => {
    let store: QuotaStore = {};
    for (let i = 0; i < 3; i++) store = ask(store)!.store;
    // 另一个 IP 不受影响
    const other = bumpQuota(store, DAY, '198.51.100.1', DAILY_LIMIT);
    assert.ok(other, '另一个 IP 应当独立计数');
    // 换一天重置
    const nextDay = bumpQuota(store, '2026-11-05', IP, DAILY_LIMIT);
    assert.ok(nextDay, '次日应当重置');
    assert.equal(nextDay!.remaining, 2);
  });

  await t.test('流量包占位套餐齐全（20 / 100 / 500）', () => {
    assert.equal(TRAFFIC_PACKS.length, 3);
    assert.deepEqual(
      TRAFFIC_PACKS.map((p) => p.asks),
      [20, 100, 500],
    );
    assert.equal(findPack('pack-20')?.priceCny, 6);
    assert.equal(findPack('pack-100')?.priceUsd, 3.99);
    assert.equal(findPack('pack-500')?.priceCny, 99);
    assert.equal(findPack('pack-500')?.priceUsd, 14.99);
    assert.equal(findPack('nope'), undefined);
  });

  await t.test('packEntry：支付未配置时不摆购买入口，配置后下发全套套餐', () => {
    const saved = {
      id: process.env.ZIWEI_ALIPAY_APP_ID,
      key: process.env.ZIWEI_ALIPAY_PRIVATE_KEY,
      pub: process.env.ZIWEI_ALIPAY_PUBLIC_KEY,
    };
    try {
      delete process.env.ZIWEI_ALIPAY_APP_ID;
      delete process.env.ZIWEI_ALIPAY_PRIVATE_KEY;
      delete process.env.ZIWEI_ALIPAY_PUBLIC_KEY;
      assert.equal(packEntry().packs.length, 0, '支付没配好时不应下发套餐');

      process.env.ZIWEI_ALIPAY_APP_ID = 'test';
      process.env.ZIWEI_ALIPAY_PRIVATE_KEY = 'test';
      process.env.ZIWEI_ALIPAY_PUBLIC_KEY = 'test';
      const e = packEntry();
      assert.equal(e.checkout, '/api/checkout');
      assert.equal(e.packs.length, TRAFFIC_PACKS.length);
    } finally {
      if (saved.id === undefined) delete process.env.ZIWEI_ALIPAY_APP_ID;
      else process.env.ZIWEI_ALIPAY_APP_ID = saved.id;
      if (saved.key === undefined) delete process.env.ZIWEI_ALIPAY_PRIVATE_KEY;
      else process.env.ZIWEI_ALIPAY_PRIVATE_KEY = saved.key;
      if (saved.pub === undefined) delete process.env.ZIWEI_ALIPAY_PUBLIC_KEY;
      else process.env.ZIWEI_ALIPAY_PUBLIC_KEY = saved.pub;
    }
  });
};
