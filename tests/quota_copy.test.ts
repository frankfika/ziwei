/**
 * 额度文案回归 —— 额度墙口径与 /account 标签。
 *
 * 关注两件事：
 *  1. 额度墙文案按登录态区分：已登录「按账户」、未登录「按 IP」（中英都要对）
 *  2. /account 的 `<dt>` 用独立标签字段，不靠 split(' ')[0] 猜
 */

import assert from 'node:assert/strict';

import { QUOTA_COPY } from '../apps/web/src/lib/quotaCopy';
import type { Tester } from './harness';

export async function suite(t: Tester): Promise<void> {
  for (const lang of ['zh', 'en'] as const) {
    const copy = QUOTA_COPY[lang];

    t.test(`${lang} 额度墙文案按 scope 区分账户 / IP`, () => {
      const ip = copy.wallBody(3, 'ip');
      const account = copy.wallBody(3, 'account');
      assert.notEqual(ip, account, '两种口径的文案必须不同');
      if (lang === 'zh') {
        assert.match(ip, /每个 IP 每天免费 3 次/);
        assert.match(account, /每个账户每天免费 3 次/);
      } else {
        assert.match(ip, /per IP per day/);
        assert.match(account, /per account per day/);
      }
    });

    t.test(`${lang} 额度墙文案不串口径`, () => {
      assert.doesNotMatch(copy.wallBody(3, 'account'), /IP/);
      assert.doesNotMatch(copy.wallBody(3, 'ip'), /账户|account/);
    });

    t.test(`${lang} /account 有独立标签字段且非空`, () => {
      assert.ok(copy.accountFreeLabel.length > 0);
      assert.ok(copy.accountPackLabel.length > 0);
    });

    t.test(`${lang} /account 标签是独立字段，不是完整文案截断`, () => {
      const full = copy.accountFree(2, 3);
      assert.notEqual(copy.accountFreeLabel, full);
      assert.ok(copy.accountFreeLabel.length < full.length);
      assert.notEqual(copy.accountPackLabel, copy.accountPack(2));
      assert.ok(copy.accountPackLabel.length < copy.accountPack(2).length);
    });
  }
}
