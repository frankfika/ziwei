/**
 * 排盘确定性。
 *
 * 两条性质：
 *  1. 同一生辰连跑两次 → 结果深度相等（除随时间变化的 currentAge / isCurrentDaXian）。
 *  2. 不同生辰 → 不应产生同一张盘（否则说明引擎把生辰吃掉了，比如缓存串号）。
 *
 * 用快照（normalizeChart）比对，因为它是剥掉时间相关字段后的规范化形式。
 */

import assert from 'node:assert/strict';

import { chart } from '@ziwei/chart-engine';

import type { Tester } from './harness';
import { GOLDEN_CASES, normalizeChart } from './fixtures/golden';

export const suite = async (t: Tester): Promise<void> => {
  await t.test('同一生辰连跑两次，深度相等', () => {
    for (const c of GOLDEN_CASES) {
      const a = normalizeChart(chart(c.birth));
      const b = normalizeChart(chart(c.birth));
      assert.deepEqual(
        b,
        a,
        `${c.id}：同一生辰两次排盘结果不一致（引擎里有非确定性成分）`,
      );
    }
  });

  await t.test('同一生辰在多个新实例上仍然一致', () => {
    const birth = { year: 1988, month: 8, day: 8, hour: 4, gender: 'female' as const };
    const a = normalizeChart(chart(birth));
    const b = normalizeChart(chart(birth));
    const c = normalizeChart(chart({ ...birth }));
    assert.deepEqual(b, a, '第二次调用结果不一致');
    assert.deepEqual(c, a, '第三次调用结果不一致');
  });

  await t.test('不同生辰不产生相同盘', () => {
    const births = [
      { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const },
      { year: 1990, month: 1, day: 1, hour: 1, gender: 'male' as const },
      { year: 1990, month: 1, day: 1, hour: 0, gender: 'female' as const },
      { year: 1990, month: 1, day: 2, hour: 0, gender: 'male' as const },
      { year: 1990, month: 2, day: 15, hour: 6, gender: 'female' as const },
      { year: 1990, month: 2, day: 15, hour: 7, gender: 'male' as const },
    ];
    const seen = new Map<string, number>();
    births.forEach((b, i) => {
      const key = JSON.stringify(normalizeChart(chart(b)));
      const prev = seen.get(key);
      assert.equal(
        prev,
        undefined,
        `第 ${i} 个生辰与第 ${prev} 个生辰排出了同一张盘：` +
          `${JSON.stringify(b)} vs ${JSON.stringify(births[prev!])}`,
      );
      seen.set(key, i);
    });
    assert.equal(seen.size, births.length, '不同生辰没有产生各自独立的盘');
  });

  await t.test('时辰序号不同 → 命宫地支不同（时辰算错一位就会破）', () => {
    const branches = new Set<number>();
    for (let hour = 0; hour <= 11; hour += 1) {
      const c = chart({ year: 1990, month: 5, day: 20, hour, gender: 'male' });
      branches.add(c.mingGongBranch);
    }
    assert.equal(
      branches.size,
      12,
      `同一日 12 个时辰只产生了 ${branches.size} 个不同的命宫地支`,
    );
  });
};

export default suite;
