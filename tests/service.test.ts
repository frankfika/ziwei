/**
 * 服务层（@ziwei/core）—— 应用侧唯一业务入口。
 *
 * 查的是三件事：
 *  1. 命中时 13 维解读齐全、总字数达标（依赖数据集）
 *  2. 没命中时必须**诚实**返回 not-covered + 中文说明，不许静默降级、不许编
 *  3. coverage() 报出来的记录数与索引里真实的记录数一致
 *
 * 「没数据」时按用例粒度 skip，纯引擎的用例照跑。
 */

import assert from 'node:assert/strict';

import { READING_DIMENSIONS } from '@ziwei/chart-engine';
import { ZiweiService } from '@ziwei/core';

import type { Tester } from './harness';
import { probeData } from './fixtures/data';

/** 一个肯定在数据集里的生辰（1990 已建索引） */
const COVERED_BIRTH = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const };

/** 一个肯定不在数据集覆盖范围内的年份（数据集覆盖 1950–2026） */
const UNCOVERED_BIRTH = { year: 1901, month: 1, day: 1, hour: 0, gender: 'male' as const };

export const suite = async (t: Tester): Promise<void> => {
  const svc = new ZiweiService();
  const data = probeData(svc.index);

  await t.test('chart() 走引擎，返回完整盘', () => {
    const c = svc.chart(COVERED_BIRTH);
    assert.equal(c.palaces.length, 12, '盘面不完整');
    assert.equal(c.mingGongBranch, c.palaces.find((p) => p.isMingGong)!.branch, '命宫地支对不上');
  });

  await t.test('summary() 输出盘面事实', () => {
    const s = svc.summary(COVERED_BIRTH);
    assert.ok(s.includes('命宫在'), 'summary 里没有命宫地支');
    assert.ok(s.includes('十二宫：'), 'summary 里没有十二宫');
  });

  await t.test('full() 同时返回盘与解读', () => {
    const r = svc.full(COVERED_BIRTH);
    assert.equal(r.birth.year, COVERED_BIRTH.year);
    assert.equal(r.chart.palaces.length, 12);
    assert.ok(
      r.reading.status === 'ok' || r.reading.status === 'not-covered',
      'reading() 返回了意料之外的状态',
    );
  });

  await t.test('未覆盖年份返回 not-covered 且 message 非空', () => {
    const r = svc.reading(UNCOVERED_BIRTH);
    assert.equal(r.status, 'not-covered', '未覆盖年份没有返回 not-covered');
    assert.ok(r.message.length > 0, 'not-covered 的 message 是空的');
    assert.equal(r.reason, 'year-not-indexed', 'reason 不是 year-not-indexed');
    assert.equal(r.year, UNCOVERED_BIRTH.year, 'not-covered 没带上年份');
    assert.ok(r.key.includes('1901-01-01'), `not-covered 的 key 不对：${r.key}`);
    // message 是给用户看的，不能是英文、不能是内部术语
    assert.ok(/[一-龥]/.test(r.message), 'not-covered 的 message 没有中文说明');
  });

  if (!data.available) {
    const reason = `${data.reason}`;
    t.skip('reading() 命中时 13 维齐全、总字数 > 10000', reason);
    t.skip('not-covered 的 availableYears 含已覆盖年份', reason);
    t.skip('coverage() 的 totalRecords 与索引实际记录数一致', reason);
    return;
  }

  await t.test('reading() 命中时 13 维齐全、总字数 > 10000', () => {
    const r = svc.reading(COVERED_BIRTH);
    assert.equal(r.status, 'ok', `本该命中却返回了 ${r.status}`);
    if (r.status !== 'ok') return;

    assert.equal(
      r.dimensions.length,
      13,
      `解读维度数不是 13（实际 ${r.dimensions.length}）`,
    );
    assert.deepEqual(
      r.dimensions.map((d) => d.key),
      [...READING_DIMENSIONS],
      '解读维度的顺序与 READING_DIMENSIONS 不一致',
    );
    for (const d of r.dimensions) {
      assert.ok(d.text.length > 0, `维度「${d.label}」文本为空`);
      assert.ok(d.label.length > 0, `维度「${d.key}」没有中文标签`);
      assert.ok(d.chars > 0, `维度「${d.label}」字数统计为 0`);
    }
    assert.ok(
      r.totalChars > 10000,
      `解读总字数只有 ${r.totalChars}，要求 > 10000`,
    );
    assert.ok(r.ms && r.ms.length > 0, '命中结果的 ms（命宫第一主星）为空');
  });

  await t.test('not-covered 的 availableYears 含已覆盖年份', () => {
    const r = svc.reading(UNCOVERED_BIRTH);
    assert.equal(r.status, 'not-covered');
    if (r.status !== 'not-covered') return;
    assert.ok(r.availableYears.length > 0, 'availableYears 是空的');
    for (const y of data.indexedYears) {
      assert.ok(
        r.availableYears.includes(y),
        `availableYears 里没有已覆盖年份 ${y}`,
      );
    }
    // message 应提示覆盖范围；年份很多时用起止摘要，不必枚举每一年
    const sorted = [...data.indexedYears].sort((a, b) => a - b);
    if (sorted.length <= 12) {
      for (const y of sorted) {
        assert.ok(
          r.message.includes(String(y)),
          `not-covered 的 message 里没有提到已覆盖年份 ${y}`,
        );
      }
    } else {
      assert.ok(
        r.message.includes(String(sorted[0])) &&
          r.message.includes(String(sorted[sorted.length - 1])) &&
          r.message.includes(`共 ${sorted.length} 年`),
        `not-covered 的 message 应含年份摘要，实际：${r.message}`,
      );
    }
  });

  await t.test('coverage() 的 totalRecords 与索引实际记录数一致', () => {
    const cov = svc.coverage();
    assert.deepEqual(cov.indexedYears, data.indexedYears, 'coverage 的 indexedYears 与实际不符');
    assert.deepEqual(cov.years, data.indexedYears, 'coverage 的 years 与实际不符');

    let expected = 0;
    for (const year of cov.indexedYears) {
      const idx = svc.index.getYearIndex(year)!;
      expected += Object.keys(idx.records).length;
    }
    assert.equal(
      cov.totalRecords,
      expected,
      `coverage().totalRecords=${cov.totalRecords}，索引里实际有 ${expected} 条`,
    );
    assert.ok(cov.totalRecords > 0, 'coverage().totalRecords 是 0');
    assert.ok(cov.dataDir.length > 0, 'coverage() 没有返回数据目录');
  });
};

export default suite;
