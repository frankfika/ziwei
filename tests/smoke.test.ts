/**
 * 引擎冒烟（重构自原 tests/smoke.ts）。
 *
 * 只做「结构完整」的粗筛：金标准快照负责精确比对，
 * 这里负责保证最基础的盘面形状没塌（12 宫、10 星、主星、身宫、大限齐全）。
 */

import assert from 'node:assert/strict';

import { chart, chartSummary, HOUR_BRANCHES } from '@ziwei/chart-engine';

import type { Tester } from './harness';

export const suite = async (t: Tester): Promise<void> => {
  await t.test('chart() 返回完整盘面结构', () => {
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });

    assert.equal(c.palaces.length, 12, '十二宫数量不对');
    assert.equal(c.daXians.length, 12, '大限数量不对');
    assert.ok(c.mingGongBranch >= 0 && c.mingGongBranch <= 11, '命宫地支越界');
    assert.ok(c.shenGongBranch >= 0 && c.shenGongBranch <= 11, '身宫地支越界');
    assert.ok(c.wuxingJu >= 2 && c.wuxingJu <= 6, `五行局数值异常：${c.wuxingJu}`);
    assert.ok(c.wuxingJuName.length > 0, '五行局名为空');
    assert.ok(c.mingZhu, '命主为空');
    assert.ok(c.shenZhu, '身主为空');

    const ming = c.palaces.filter((p) => p.isMingGong);
    assert.equal(ming.length, 1, '命宫数量不为 1');
    const shen = c.palaces.filter((p) => p.isShenGong);
    assert.equal(shen.length, 1, '身宫数量不为 1');
  });

  await t.test('十二宫按地支 0–11 排序且宫名齐全', () => {
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    const branches = c.palaces.map((p) => p.branch);
    assert.deepEqual(branches, [...Array(12).keys()], '十二宫没有按地支排序');
    for (const p of c.palaces) {
      assert.ok(p.name.length > 0, `第 ${p.branch} 宫没有宫名`);
      assert.equal(p.branchName, HOUR_BRANCHES[p.branch], `第 ${p.branch} 宫地支名不对`);
    }
    const names = new Set(c.palaces.map((p) => p.name));
    for (const must of ['命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫']) {
      assert.ok(names.has(must), `十二宫缺少「${must}」`);
    }
  });

  await t.test('适配器输出契约：宫名带「宫」字后缀', () => {
    // 适配器把引擎原始的两字宫名（兄弟 / 财帛 / 夫妻）统一补成「兄弟宫 / 财帛宫 / 夫妻宫」，
    // 下游（Web / CLI / 提示词）就不用各自处理。这条契约变了要有人知道。
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    for (const p of c.palaces) {
      assert.ok(
        p.name.endsWith('宫'),
        `第 ${p.branch} 宫宫名「${p.name}」没有「宫」字后缀`,
      );
      if (p.borrowedFromName) {
        assert.ok(
          p.borrowedFromName.endsWith('宫'),
          `第 ${p.branch} 宫的 borrowedFromName「${p.borrowedFromName}」没有「宫」字后缀`,
        );
      }
    }
    for (const d of c.daXians) {
      assert.ok(
        d.palaceName.endsWith('宫'),
        `大限宫名「${d.palaceName}」没有「宫」字后缀`,
      );
    }
  });

  await t.test('宫内星曜按类型分组自洽', () => {
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    for (const p of c.palaces) {
      assert.deepEqual(
        p.majorStars,
        p.stars.filter((s) => s.type === 'major').map((s) => s.name),
        `${p.name} 的主星分组与 stars 不一致`,
      );
      assert.deepEqual(
        p.minorStars,
        p.stars.filter((s) => s.type === 'minor').map((s) => s.name),
        `${p.name} 的辅星分组与 stars 不一致`,
      );
    }
  });

  await t.test('chartSummary() 输出包含盘面关键事实', () => {
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    const s = chartSummary(c);
    assert.ok(s.includes('命宫在'), 'summary 里没有命宫地支');
    assert.ok(s.includes(c.wuxingJuName), 'summary 里没有五行局');
    assert.ok(s.includes(c.mingZhu ?? ''), 'summary 里没有命主');
    assert.ok(s.includes('十二宫：'), 'summary 里没有十二宫段落');
  });

  await t.test('农历与四柱字段齐全', () => {
    const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    assert.ok(c.lunar.lunarYear > 0, '农历年缺失');
    assert.ok(c.lunar.lunarMonth >= 1 && c.lunar.lunarMonth <= 12, '农历月异常');
    assert.ok(c.lunar.lunarDay >= 1 && c.lunar.lunarDay <= 30, '农历日异常');
    assert.equal(typeof c.lunar.isLeapMonth, 'boolean', 'isLeapMonth 不是布尔值');
  });
};

export default suite;
