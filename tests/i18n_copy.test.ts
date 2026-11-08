/**
 * 双语文案回归 —— 每个 copy 模块的中英必须完全对齐。
 *
 * 关注三件事：
 *  1. zh / en 的键集合完全一致（少一个键 = 某个界面会露出另一种语言）
 *  2. 字符串值非空（空串 = 文案漏填）
 *  3. 值的类型一致（一边是函数一边是字符串 = 调用点会炸）
 */

import assert from 'node:assert/strict';

import { QUOTA_COPY } from '../apps/web/src/lib/quotaCopy';
import { CHAT_COPY } from '../apps/web/src/lib/chatCopy';
import { AI_COPY } from '../apps/web/src/lib/aiCopy';
import { FORM_COPY } from '../apps/web/src/lib/formCopy';
import { CHART_COPY } from '../apps/web/src/lib/chartCopy';
import { READING_COPY } from '../apps/web/src/lib/readingCopy';
import { SITE_COPY } from '../apps/web/src/lib/siteCopy';
import type { Tester } from './harness';

type CopyModule = Record<string, unknown>;

/** 所有 copy 模块（新增 copy 文件时在这里登记） */
const MODULES: Record<string, CopyModule> = {
  quotaCopy: QUOTA_COPY as unknown as CopyModule,
  chatCopy: CHAT_COPY as unknown as CopyModule,
  aiCopy: AI_COPY as unknown as CopyModule,
  formCopy: FORM_COPY as unknown as CopyModule,
  chartCopy: CHART_COPY as unknown as CopyModule,
  readingCopy: READING_COPY as unknown as CopyModule,
  siteCopy: SITE_COPY as unknown as CopyModule,
};

export async function suite(t: Tester): Promise<void> {
  for (const [name, mod] of Object.entries(MODULES)) {
    t.test(`${name} 中英键集合一致`, () => {
      const zh = (mod.zh ?? {}) as Record<string, unknown>;
      const en = (mod.en ?? {}) as Record<string, unknown>;
      const zhKeys = Object.keys(zh).sort();
      const enKeys = Object.keys(en).sort();
      assert.deepEqual(
        enKeys,
        zhKeys,
        `${name}: en 缺少/多了键 —— 差异 ${zhKeys
          .filter((k) => !enKeys.includes(k))
          .concat(enKeys.filter((k) => !zhKeys.includes(k)))
          .join(', ')}`,
      );
    });

    t.test(`${name} 文案非空且类型一致`, () => {
      const zh = (mod.zh ?? {}) as Record<string, unknown>;
      const en = (mod.en ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(zh)) {
        const z = zh[key];
        const e = en[key];
        assert.equal(typeof e, typeof z, `${name}.${key} 类型不一致`);
        if (typeof z === 'string') {
          assert.ok(z.trim().length > 0, `${name}.${key} 中文为空`);
          assert.ok((e as string).trim().length > 0, `${name}.${key} 英文为空`);
        }
      }
    });
  }
}
