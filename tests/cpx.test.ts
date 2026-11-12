/**
 * CPX 问卷解锁 —— 签名、换算、幂等台账回归。
 *
 * 覆盖：
 *  1. cpxSecureHash 与官方公式 md5(ext_user_id + '-' + app_secure_hash) 逐字节一致
 *  2. asksFromPayout 换算与边界（含 env 覆盖）
 *  3. postback 验签（对/错/缺参/debug 开关）
 *  4. recordCpxTx 幂等：同 txId 二次登记返回 false，余额只加一次
 *  5. cpxConfigured env 门控
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Tester } from './harness';

// 状态目录指到临时目录（cpx-tx.json 落盘），不碰真实 .data
const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-cpx-'));
process.env.ZIWEI_STATE_DIR = STATE_DIR;

process.env.ZIWEI_CPX_APP_ID = 'test-app';
process.env.ZIWEI_CPX_SECRET = 'test-secret';
delete process.env.ZIWEI_CPX_DEBUG;
delete process.env.ZIWEI_CPX_ASKS_PER_USD;

const { addPackBalance, ensureUser, getUserById, recordCpxTx } = await import(
  '../apps/web/src/lib/account'
);
const { asksFromPayout, cpxConfigured, cpxSecureHash, verifyCpxPostback } = await import(
  '../apps/web/src/lib/cpx'
);

/** 官方 PHP 示例同款拼法，硬编码期望值防回归 */
function officialHash(userId: string, secret: string): string {
  return crypto.createHash('md5').update(`${userId}-${secret}`).digest('hex');
}

export const suite = async (t: Tester): Promise<void> => {
  await t.test('cpxSecureHash 与官方公式逐字节一致', () => {
    assert.equal(cpxSecureHash('u123'), officialHash('u123', 'test-secret'));
    assert.match(cpxSecureHash('u123'), /^[0-9a-f]{32}$/);
  });

  await t.test('asksFromPayout：默认 25/USD、最少 1 次、零/负金额不发', () => {
    assert.equal(asksFromPayout(0.5), 12);
    assert.equal(asksFromPayout(0.01), 1, '再少的有效金额也保底 1 次');
    assert.equal(asksFromPayout(0), 0);
    assert.equal(asksFromPayout(-1), 0);
    assert.equal(asksFromPayout(NaN), 0);
  });

  await t.test('asksFromPayout：env 可调单价', () => {
    process.env.ZIWEI_CPX_ASKS_PER_USD = '50';
    assert.equal(asksFromPayout(0.5), 25);
    delete process.env.ZIWEI_CPX_ASKS_PER_USD;
    assert.equal(asksFromPayout(0.5), 12, '删掉 env 回落默认 25');
  });

  await t.test('verifyCpxPostback：签名对/错/缺参', () => {
    const tx = 'tx-1';
    const sig = officialHash(tx, 'test-secret');
    assert.ok(verifyCpxPostback({ tx, uid: 'u1', sig }));
    assert.ok(!verifyCpxPostback({ tx, uid: 'u1', sig: 'deadbeef' }), '错签必须拒绝');
    assert.ok(!verifyCpxPostback({ tx: '', uid: 'u1', sig }), '缺 tx 拒绝');
    assert.ok(!verifyCpxPostback({ tx, uid: '', sig }), '缺 uid 拒绝');
  });

  await t.test('verifyCpxPostback：debug 开关放行（标定用）', () => {
    process.env.ZIWEI_CPX_DEBUG = '1';
    assert.ok(verifyCpxPostback({ tx: 'tx-dbg', uid: 'u1', sig: 'anything' }));
    assert.ok(!verifyCpxPostback({ tx: '', uid: 'u1', sig: 'x' }), 'debug 也要求有 tx/uid');
    delete process.env.ZIWEI_CPX_DEBUG;
    assert.ok(!verifyCpxPostback({ tx: 'tx-dbg', uid: 'u1', sig: 'anything' }), '关回严格模式');
  });

  await t.test('recordCpxTx 幂等：重复回调不重复发奖', () => {
    const u = ensureUser('cpx-test@example.com');
    addPackBalance(u.id, 0 - getUserById(u.id)!.packBalance); // 归零
    assert.ok(recordCpxTx('tx-100', u.id, 5), '首次登记');
    addPackBalance(u.id, 5);
    assert.equal(getUserById(u.id)!.packBalance, 5);
    assert.ok(!recordCpxTx('tx-100', u.id, 5), '同 txId 二次登记必须拒');
    assert.equal(getUserById(u.id)!.packBalance, 5, '重复回调不重复加');
    assert.ok(recordCpxTx('tx-101', u.id, 1), '不同 txId 照常登记');
    assert.ok(!recordCpxTx('', u.id, 1), '空 txId 拒');
  });

  await t.test('cpxConfigured：env 门控', () => {
    assert.ok(cpxConfigured());
    const keep = process.env.ZIWEI_CPX_SECRET;
    delete process.env.ZIWEI_CPX_SECRET;
    assert.ok(!cpxConfigured(), '缺 secret 即未配置 → 入口隐藏');
    process.env.ZIWEI_CPX_SECRET = keep;
  });
};
