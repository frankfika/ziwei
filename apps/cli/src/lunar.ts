/**
 * 农历 / 干支的中文显示名。
 *
 * 这里只做「格式化」：数值全部来自排盘引擎（`ChartJSON.lunar`），
 * 本文件不参与任何排盘计算。
 */

const LUNAR_MONTHS = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];

const LUNAR_DAYS = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 农历月名（闰月加「闰」前缀） */
export function lunarMonthName(month: number, isLeap: boolean): string {
  const base = LUNAR_MONTHS[month - 1] ?? `${month}月`;
  return isLeap ? `闰${base}` : base;
}

/** 农历日名 */
export function lunarDayName(day: number): string {
  return LUNAR_DAYS[day - 1] ?? `${day}日`;
}

/** 天干名（甲乙丙丁戊己庚辛壬癸），下标 0–9 */
export const STEM_NAMES = [
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
] as const;

/** 地支名（子丑寅卯辰巳午未申酉戌亥），下标 0–11 */
export const BRANCH_NAMES = [
  '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
] as const;

/** 干支名，如「己巳」 */
export function ganZhi(stemIndex: number, branchIndex: number): string {
  const stem = STEM_NAMES[stemIndex] ?? '?';
  const branch = BRANCH_NAMES[branchIndex] ?? '?';
  return stem + branch;
}
