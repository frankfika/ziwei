/**
 * 账户 / 验证码 / 会话 / 账户额度 —— 本地存储层回归。
 *
 * 全部走真实落盘（ZIWEI_STATE_DIR 指到临时目录），不 mock fs：
 * 落盘格式与额度口径是最容易悄悄坏掉的地方。
 *
 * 覆盖：
 *  1. 验证码：发放 / 校验 / 用后作废 / 试错上限 / 过期
 *  2. 会话：创建 / 查询 / 注销
 *  3. 账户额度：先免费日额 → 再流量包余额 → 都尽才出墙；失败退还
 *  4. stub 下单：加余额 + 记订单
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Tester } from './harness';

// 状态目录指到临时目录 —— 每个用例前清空，测试不碰真实 .data
const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-account-'));
process.env.ZIWEI_STATE_DIR = STATE_DIR;

const {
  addPackBalance,
  chargeUserAsk,
  createOrder,
  createSession,
  destroySession,
  ensureUser,
  getOrder,
  getSessionUser,
  getUser,
  getUserById,
  isValidEmail,
  issueOtp,
  listOrders,
  markOrderPaid,
  normalizeEmail,
  otpRateLimit,
  refundUserAsk,
  userIdFor,
  verifyOtp,
} = await import('../apps/web/src/lib/account');

/** 清空落盘状态（每个用例开头调） */
function reset(): void {
  for (const f of fs.readdirSync(STATE_DIR)) {
    fs.unlinkSync(path.join(STATE_DIR, f));
  }
}

export const suite = async (t: Tester): Promise<void> => {
  await t.test('邮箱归一化与格式校验', () => {
    assert.equal(normalizeEmail('  Foo@Example.COM '), 'foo@example.com');
    assert.equal(isValidEmail('a@b.co'), true);
    assert.equal(isValidEmail('nope'), false);
    assert.equal(isValidEmail('a@b'), false);
    // userId 由邮箱派生 —— 同邮箱永远同 id
    assert.equal(userIdFor('A@B.com'), userIdFor('a@b.com'));
    assert.notEqual(userIdFor('a@b.com'), userIdFor('c@b.com'));
  });

  await t.test('验证码：发放 → 校验通过 → 用后作废', () => {
    reset();
    const { code, record } = issueOtp('x@example.com');
    assert.match(code, /^\d{6}$/);
    assert.equal(record.email, 'x@example.com');
    assert.ok(new Date(record.expiresAt).getTime() > Date.now());
    assert.equal(verifyOtp('x@example.com', code), true);
    // 用过即作废 —— 同一个码不能复用
    assert.equal(verifyOtp('x@example.com', code), false);
  });

  await t.test('验证码：错误码不通过，且有试错上限', () => {
    reset();
    const { code } = issueOtp('y@example.com');
    for (let i = 0; i < 5; i++) {
      assert.equal(verifyOtp('y@example.com', '000000'), false);
    }
    // 试错满 5 次后即使给出正确码也不认
    assert.equal(verifyOtp('y@example.com', code), false);
  });

  await t.test('验证码：60 秒内同邮箱不能重复发', () => {
    reset();
    issueOtp('z@example.com');
    const wait = otpRateLimit('z@example.com');
    assert.ok(wait !== null && wait > 0, '第二次发码应当被限流');
    // 别的邮箱不受影响
    assert.equal(otpRateLimit('other@example.com'), null);
  });

  await t.test('会话：创建 → 查询 → 注销', () => {
    reset();
    const user = ensureUser('s@example.com');
    const session = createSession(user.id);
    assert.equal(getSessionUser(session.token)?.id, user.id);
    destroySession(session.token);
    assert.equal(getSessionUser(session.token), null);
    assert.equal(getSessionUser('nonexistent'), null);
    assert.equal(getSessionUser(undefined), null);
  });

  await t.test('账户额度：先扣免费日额，再用流量包余额', () => {
    reset();
    const user = ensureUser('q@example.com');

    // 前 3 次走免费日额
    for (let i = 0; i < 3; i++) {
      const r = chargeUserAsk(user.id);
      assert.equal(r.ok, true);
      assert.equal(r.ok && r.kind, 'free');
    }

    // 免费用尽 → 出墙
    const denied = chargeUserAsk(user.id);
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.limit, 3);

    // 买了流量包 → 继续扣余额
    addPackBalance(user.id, 2);
    const a = chargeUserAsk(user.id);
    assert.equal(a.ok, true);
    assert.equal(a.ok && a.kind, 'pack');
    assert.equal(a.ok && a.packRemaining, 1);

    const b = chargeUserAsk(user.id);
    assert.equal(b.ok, true);
    assert.equal(b.ok && b.packRemaining, 0);

    // 余额也尽 → 再出墙
    assert.equal(chargeUserAsk(user.id).ok, false);
  });

  await t.test('账户额度：退还 —— 免费退免费、包退包', () => {
    reset();
    const user = ensureUser('r@example.com');

    // 第一次扣的是免费额度，退还后免费额度回来（还能再扣一次免费）
    const first = chargeUserAsk(user.id);
    assert.equal(first.ok && first.kind, 'free');
    refundUserAsk(user.id, 'free');
    const again = chargeUserAsk(user.id);
    assert.equal(again.ok && again.kind, 'free');

    // 把免费日额用光（今天共 3 次）→ 之后扣的是流量包
    chargeUserAsk(user.id);
    chargeUserAsk(user.id);
    addPackBalance(user.id, 1);
    const packed = chargeUserAsk(user.id);
    assert.equal(packed.ok && packed.kind, 'pack');
    assert.equal(packed.ok && packed.packRemaining, 0);

    // 退还包 → 余额回来
    refundUserAsk(user.id, 'pack');
    assert.equal(getUserById(user.id)?.packBalance, 1);
  });

  await t.test('下单：pending 不加余额，支付成功才幂等入账', () => {
    reset();
    const user = ensureUser('o@example.com');
    const order = createOrder(user.id, {
      id: 'pack-20',
      asks: 20,
      priceCny: 6,
      priceUsd: 0.99,
    });
    // 未支付：订单 pending，余额纹丝不动
    assert.equal(order.status, 'pending');
    assert.equal(getUser('o@example.com')?.packBalance, 0);

    // 支付成功：入账一次
    const paid = markOrderPaid(order.id, '2026110522001');
    assert.equal(paid?.status, 'paid');
    assert.equal(paid?.tradeNo, '2026110522001');
    assert.equal(getUser('o@example.com')?.packBalance, 20);

    // 幂等：重复回调/轮询不重复入账
    markOrderPaid(order.id, '2026110522001');
    assert.equal(getUser('o@example.com')?.packBalance, 20);

    const orders = listOrders(user.id);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].packId, 'pack-20');
    assert.equal(orders[0].asks, 20);
    assert.equal(orders[0].status, 'paid');
    assert.equal(getOrder(order.id)?.status, 'paid');
  });

  await t.test('用户额度与 IP 额度分开计数', async () => {
    reset();
    const { reserveFor } = await import('../apps/web/src/lib/askAccess');
    const user = ensureUser('sep@example.com');

    // 用户的免费额度用完
    for (let i = 0; i < 3; i++) reserveFor({ kind: 'user', userId: user.id });
    assert.equal(reserveFor({ kind: 'user', userId: user.id }).ok, false);

    // 同 IP 的访客额度不受影响
    const r = reserveFor({ kind: 'ip', ip: '203.0.113.9' });
    assert.equal(r.ok, true);
  });
};
