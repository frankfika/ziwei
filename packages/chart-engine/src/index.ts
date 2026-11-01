/**
 * @ziwei/chart-engine
 *
 * 排盘引擎封装层。排盘是确定性计算，只走这里，不允许 LLM 代算。
 *
 * 引擎源码 vendored 自上游开源仓库（MIT）：
 *   https://github.com/Renhuai123/ziwei-doushu  作者: 王多鱼AI
 * 详见 ../../ATTRIBUTION.md
 */

export * from './types';
export { chart, chartSummary, validateBirth, palaceAt, liuNianLayer, daXianLayer, liuYueLayer } from './adapter';
export { SI_HUA_TABLE, STEMS, BRANCHES } from './engine/constants';

/** 时辰序号 → 钟点区间文案 */
export { calcTrueSolarBranch } from './engine/share';

import { HOUR_BRANCHES } from './types';

/**
 * 钟点 → 时辰序号（**不做真太阳时校正**）。
 *
 * 与 v4.0-13d 数据集口径一致：数据集「按时辰序号直接排盘」，
 * 没有按出生地做真太阳时校正，所以这里也不做，
 * 否则检索键会与数据集错位。
 *
 * 边界：子时横跨 23:00–00:59，两段都归时辰序号 0。
 */
export function shichenFromClock(clockHour: number, clockMinute = 0): number {
  if (!Number.isInteger(clockHour) || clockHour < 0 || clockHour > 23) {
    throw new RangeError(`clockHour must be 0-23; received ${clockHour}`);
  }
  if (!Number.isInteger(clockMinute) || clockMinute < 0 || clockMinute > 59) {
    throw new RangeError(`clockMinute must be 0-59; received ${clockMinute}`);
  }
  const mins = clockHour * 60 + clockMinute;
  // 23:00–23:59 → 子时(0)；00:00–00:59 → 子时(0)
  if (mins >= 23 * 60 || mins < 60) return 0;
  return Math.floor((mins - 60) / 120) + 1;
}

/**
 * 是否为「晚子时」（23:00–23:59）。
 *
 * 晚子时按**次日**排盘（倪海厦体系 / 三合派标准）。
 * 排盘日 = 出生日 + 1，时辰序号 = 0。
 */
export function isLateZi(clockHour: number): boolean {
  return clockHour === 23;
}

/**
 * 钟点 → 排盘日 + 时辰序号。
 *
 * 注意：这里返回的 day 已经是「排盘日」（晚子时 +1），
 * 与数据集 key 的 y/m/d 口径一致 —— 数据集 key 用的是**排盘日**，
 * 不是原始出生日。这一点由 tests/test_key_alignment.test.ts 实证校验。
 */
export function resolveChartDate(
  year: number,
  month: number,
  day: number,
  clockHour: number,
  clockMinute = 0,
): { year: number; month: number; day: number; hour: number } {
  let y = year;
  let m = month;
  let d = day;
  if (isLateZi(clockHour)) {
    const next = new Date(y, m - 1, d + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  return { year: y, month: m, day: d, hour: shichenFromClock(clockHour, clockMinute) };
}

/** 时辰序号 → 中文名（含「时」后缀） */
export function hourLabel(hour: number): string {
  return `${HOUR_BRANCHES[hour] ?? '?'}时`;
}
