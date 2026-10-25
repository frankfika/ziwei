/**
 * 边界与错误处理。
 *
 * 三块：
 *  1. 非法输入必须抛 InvalidBirthError（**不能**静默顺延成相邻日期 —— 那会排出错盘还不知道）
 *  2. shichenFromClock：钟点 → 时辰序号
 *  3. resolveChartDate：钟点 → 排盘日 + 时辰序号（晚子时按次日排盘）
 *
 * 纯引擎用例，不依赖数据集 —— CI 没有数据也必须全绿。
 */

import assert from 'node:assert/strict';

import {
  HOUR_BRANCHES,
  HOUR_RANGES,
  InvalidBirthError,
  chart,
  hourLabel,
  isLateZi,
  resolveChartDate,
  shichenFromClock,
} from '@ziwei/chart-engine';

import type { Tester } from './harness';

/** 非法生辰 → 必须抛 InvalidBirthError */
const INVALID_BIRTHS: Array<{ label: string; birth: Record<string, unknown> }> = [
  { label: '2 月 30 日', birth: { year: 1990, month: 2, day: 30, hour: 0, gender: 'male' } },
  { label: '非闰年 2 月 29 日', birth: { year: 1991, month: 2, day: 29, hour: 0, gender: 'male' } },
  { label: '4 月 31 日', birth: { year: 1990, month: 4, day: 31, hour: 0, gender: 'male' } },
  { label: 'hour = -1', birth: { year: 1990, month: 1, day: 1, hour: -1, gender: 'male' } },
  { label: 'hour = 12', birth: { year: 1990, month: 1, day: 1, hour: 12, gender: 'male' } },
  { label: 'hour = 1.5', birth: { year: 1990, month: 1, day: 1, hour: 1.5, gender: 'male' } },
  { label: '月份 0', birth: { year: 1990, month: 0, day: 1, hour: 0, gender: 'male' } },
  { label: '月份 13', birth: { year: 1990, month: 13, day: 1, hour: 0, gender: 'male' } },
  { label: '日 0', birth: { year: 1990, month: 1, day: 0, hour: 0, gender: 'male' } },
  { label: '性别非法', birth: { year: 1990, month: 1, day: 1, hour: 0, gender: 'other' } },
  { label: '年份越界', birth: { year: 1899, month: 1, day: 1, hour: 0, gender: 'male' } },
];

export const suite = async (t: Tester): Promise<void> => {
  await t.test('非法输入抛 InvalidBirthError', () => {
    for (const c of INVALID_BIRTHS) {
      assert.throws(
        () => chart(c.birth as never),
        (err: unknown) => err instanceof InvalidBirthError,
        `「${c.label}」应该抛 InvalidBirthError，实际没抛或抛了别的类型`,
      );
    }
  });

  await t.test('非法输入的报错信息说清原因', () => {
    assert.throws(
      () => chart({ year: 1990, month: 2, day: 30, hour: 0, gender: 'male' }),
      /1990-2-30|该日期不存在/,
      '2 月 30 日的报错没有指明日期不存在',
    );
    assert.throws(
      () => chart({ year: 1990, month: 1, day: 1, hour: 12, gender: 'male' }),
      /时辰/,
      '时辰越界的报错没有提到时辰',
    );
  });

  await t.test('合法边界输入不抛错', () => {
    const valid = [
      { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const },
      { year: 2000, month: 2, day: 29, hour: 11, gender: 'female' as const },
      { year: 1900, month: 1, day: 1, hour: 0, gender: 'male' as const },
      { year: 2100, month: 12, day: 31, hour: 11, gender: 'female' as const },
    ];
    for (const b of valid) {
      const c = chart(b);
      assert.equal(c.palaces.length, 12, `${JSON.stringify(b)} 排出了一张不完整的盘`);
    }
  });

  await t.test('shichenFromClock 钟点 → 时辰序号', () => {
    const cases: Array<[number, number, number]> = [
      [23, 59, 0], // 23:59 → 子时
      [0, 0, 0], // 00:00 → 子时
      [0, 59, 0], // 00:59 → 子时
      [1, 0, 1], // 01:00 → 丑时
      [12, 0, 6], // 12:00 → 午时
      [22, 59, 11], // 22:59 → 亥时（亥 = 21:00–22:59，见 HOUR_RANGES）
      [23, 0, 0], // 23:00 → 子时（晚子时）
    ];
    for (const [h, m, expected] of cases) {
      assert.equal(
        shichenFromClock(h, m),
        expected,
        `shichenFromClock(${h}, ${m}) 应为 ${expected}（${hourLabel(expected)}），` +
          `实际 ${shichenFromClock(h, m)}（${hourLabel(shichenFromClock(h, m))}）`,
      );
    }
  });

  await t.test('shichenFromClock 与 HOUR_RANGES 自洽', () => {
    // 每个时辰区间的首尾各取一个钟点，都应落回同一序号
    for (let hour = 0; hour < 12; hour += 1) {
      const range = HOUR_RANGES[hour];
      const m = /^(\d{2}):(\d{2})–(\d{2}):(\d{2})$/.exec(range);
      assert.ok(m, `HOUR_RANGES[${hour}] 格式不对：${range}`);
      const startH = Number(m[1]);
      const startM = Number(m[2]);
      const endH = Number(m[3]);
      const endM = Number(m[4]);
      assert.equal(
        shichenFromClock(startH, startM),
        hour,
        `${range} 的起点应落在时辰 ${hour}`,
      );
      // 区间末点：23:59 归子时(0)，其余归本序号
      const endIdx = endH === 23 && endM === 59 ? 0 : hour;
      assert.equal(
        shichenFromClock(endH, endM),
        endIdx,
        `${range} 的末点应落在时辰 ${endIdx}`,
      );
    }
  });

  await t.test('shichenFromClock 拒绝非法钟点', () => {
    assert.throws(() => shichenFromClock(24, 0), RangeError, '24 点应该被拒');
    assert.throws(() => shichenFromClock(-1, 0), RangeError, '-1 点应该被拒');
    assert.throws(() => shichenFromClock(1.5, 0), RangeError, '1.5 点应该被拒');
    assert.throws(() => shichenFromClock(1, 60), RangeError, '60 分应该被拒');
  });

  await t.test('isLateZi 只认 23 点', () => {
    assert.equal(isLateZi(23), true, '23 点是晚子时');
    assert.equal(isLateZi(22), false, '22 点不是晚子时');
    assert.equal(isLateZi(0), false, '0 点不是晚子时');
  });

  await t.test('hourLabel 时辰序号 → 中文', () => {
    assert.equal(hourLabel(0), '子时');
    assert.equal(hourLabel(1), '丑时');
    assert.equal(hourLabel(11), '亥时');
    assert.equal(hourLabel(11), `${HOUR_BRANCHES[11]}时`);
  });

  await t.test('resolveChartDate 晚子时按次日排盘', () => {
    assert.deepEqual(
      resolveChartDate(1990, 1, 1, 23, 30),
      { year: 1990, month: 1, day: 2, hour: 0 },
      '1990-01-01 23:30 应排到 1990-01-02 子时',
    );
  });

  await t.test('resolveChartDate 月末跨月', () => {
    assert.deepEqual(
      resolveChartDate(1990, 4, 30, 23, 30),
      { year: 1990, month: 5, day: 1, hour: 0 },
      '1990-04-30 23:30 应排到 1990-05-01 子时',
    );
  });

  await t.test('resolveChartDate 年末跨年', () => {
    assert.deepEqual(
      resolveChartDate(1990, 12, 31, 23, 30),
      { year: 1991, month: 1, day: 1, hour: 0 },
      '1990-12-31 23:30 应排到 1991-01-01 子时',
    );
  });

  await t.test('resolveChartDate 闰年 2 月 29 日跨日', () => {
    assert.deepEqual(
      resolveChartDate(2000, 2, 29, 23, 30),
      { year: 2000, month: 3, day: 1, hour: 0 },
      '2000-02-29 23:30 应排到 2000-03-01 子时',
    );
  });

  await t.test('resolveChartDate 非晚子时保持原日期', () => {
    assert.deepEqual(
      resolveChartDate(1990, 5, 20, 3, 15),
      { year: 1990, month: 5, day: 20, hour: 2 },
      '非晚子时不应改日期',
    );
    assert.deepEqual(
      resolveChartDate(1990, 5, 20, 0, 30),
      { year: 1990, month: 5, day: 20, hour: 0 },
      '0 点不应改日期',
    );
  });

  await t.test('resolveChartDate 的排盘日能被引擎正常排盘', () => {
    const r = resolveChartDate(1990, 12, 31, 23, 30);
    const c = chart({ year: r.year, month: r.month, day: r.day, hour: r.hour, gender: 'male' });
    assert.equal(c.palaces.length, 12, '跨年排盘日排出了不完整的盘');
  });
};

export default suite;
