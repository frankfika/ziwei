/**
 * 输入层口径 —— 浏览器可用的纯函数。
 *
 * ⚠️ 这里刻意**不**从 `@ziwei/chart-engine` import：chart-engine 的入口会把排盘引擎
 * （iztro + lunar-javascript）一起拖进客户端 bundle。本文件只是「钟点 → 时辰序号」
 * 这条输入层映射的镜像，**权威实现仍是服务端**：
 *   - 表单提交由 `src/app/actions.ts` 的 Server Action 调用引擎自带的
 *     `resolveChartDate()` 计算排盘日与时辰序号，再重定向到 `/chart`。
 *   - 本文件只负责表单里的「实时口径预览」。
 * 两者的一致性由 `apps/web/scripts/check-birth-parity.ts` 穷举校验。
 */

/** 时辰序号 → 地支名（子=0 … 亥=11） */
export const SHICHEN_NAMES = [
  '子', '丑', '寅', '卯', '辰', '巳',
  '午', '未', '申', '酉', '戌', '亥',
] as const;

/** 天干（与排盘引擎常量顺序一致） */
export const STEM_NAMES = [
  '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
] as const;

/** 时辰序号 → 钟点区间（与数据集口径一致，不做真太阳时校正） */
export const SHICHEN_RANGES = [
  '23:00–00:59', '01:00–02:59', '03:00–04:59', '05:00–06:59',
  '07:00–08:59', '09:00–10:59', '11:00–12:59', '13:00–14:59',
  '15:00–16:59', '17:00–18:59', '19:00–20:59', '21:00–22:59',
] as const;

export type Gender = 'male' | 'female';

/** 输入口径：时辰下拉（与数据集严格对齐）/ 钟点（便捷输入） */
export type TimeMode = 'shichen' | 'clock';

/** 子时归属：当日子时（00:00–00:59）/ 晚子时（23:00–23:59 → 按次日排盘） */
export type ZiVariant = 'same' | 'next';

export const GENDER_LABEL: Record<Gender, string> = { male: '男', female: '女' };

/** 钟点 → 时辰序号 0–11（不做真太阳时校正）。 */
export function shichenFromClock(clockHour: number, clockMinute = 0): number {
  const mins = clockHour * 60 + clockMinute;
  if (mins >= 23 * 60 || mins < 60) return 0;
  return Math.floor((mins - 60) / 120) + 1;
}

/** 是否为晚子时（23 点）：按次日排盘。 */
export function isLateZi(clockHour: number): boolean {
  return clockHour === 23;
}

/** 钟点 → 排盘日 + 时辰序号（晚子时排到次日）。 */
export function resolveChartDate(
  year: number,
  month: number,
  day: number,
  clockHour: number,
  clockMinute = 0,
): { year: number; month: number; day: number; hour: number; lateZi: boolean } {
  let y = year;
  let m = month;
  let d = day;
  const lateZi = isLateZi(clockHour);
  if (lateZi) {
    const next = new Date(y, m - 1, d + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  return { year: y, month: m, day: d, hour: shichenFromClock(clockHour, clockMinute), lateZi };
}

/** 表单状态 */
export interface BirthFormState {
  name: string;
  year: string;
  month: string;
  day: string;
  timeMode: TimeMode;
  /** 时辰序号 0–11 */
  shichen: number;
  /** 子时归属（仅 timeMode === 'shichen' 且 shichen === 0 时生效） */
  ziVariant: ZiVariant;
  /** 钟点（仅 timeMode === 'clock' 时生效），字符串便于表单受控 */
  clockHour: string;
  clockMinute: string;
  gender: Gender;
}

export const EMPTY_FORM: BirthFormState = {
  name: '',
  year: '',
  month: '',
  day: '',
  timeMode: 'shichen',
  shichen: 0,
  ziVariant: 'same',
  clockHour: '12',
  clockMinute: '0',
  gender: 'male',
};

/** 解析后的排盘口径 */
export interface ResolvedBirth {
  /** 排盘日（公历） */
  year: number;
  month: number;
  day: number;
  /** 时辰序号 0–11 */
  hour: number;
  /** 是否触发了晚子时换日 */
  lateZi: boolean;
  /** 用户原始输入的出生日期 */
  birthDate: { year: number; month: number; day: number };
  /** 口径说明文案 */
  note: string;
}

export interface ResolvedInput {
  ok: boolean;
  error?: string;
  resolved?: ResolvedBirth;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function formatClock(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

/**
 * 把表单状态解析成排盘口径。
 *
 * - 时辰模式：排盘日 = 用户填的日期；子时可选「当日子时 / 晚子时（次日）」。
 * - 钟点模式：走 resolveChartDate()，23 点自动顺延到次日子时。
 */
export function resolveForm(form: BirthFormState): ResolvedInput {
  const year = Number(form.year);
  const month = Number(form.month);
  const day = Number(form.day);
  if (!form.year || !form.month || !form.day) {
    return { ok: false, error: '请填写完整的出生日期' };
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return { ok: false, error: '出生年份需在 1900–2100 之间' };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: '出生月份需在 1–12 之间' };
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, error: '出生日期需在 1–31 之间' };
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return { ok: false, error: `该日期不存在：${year}-${pad(month)}-${pad(day)}` };
  }

  const birthDate = { year, month, day };

  if (form.timeMode === 'clock') {
    const clockHour = Number(form.clockHour);
    const clockMinute = Number(form.clockMinute);
    if (
      !Number.isInteger(clockHour) || clockHour < 0 || clockHour > 23 ||
      !Number.isInteger(clockMinute) || clockMinute < 0 || clockMinute > 59
    ) {
      return { ok: false, error: '钟点需在 00:00–23:59 之间' };
    }
    const r = resolveChartDate(year, month, day, clockHour, clockMinute);
    const note = r.lateZi
      ? `钟点 ${formatClock(clockHour, clockMinute)} 属晚子时（23:00–23:59），已按传统规则顺延至次日 ${formatDate(r.year, r.month, r.day)} 排盘`
      : `钟点 ${formatClock(clockHour, clockMinute)} 归入${SHICHEN_NAMES[r.hour]}时（${SHICHEN_RANGES[r.hour]}），排盘日 ${formatDate(r.year, r.month, r.day)}`;
    return {
      ok: true,
      resolved: {
        year: r.year,
        month: r.month,
        day: r.day,
        hour: r.hour,
        lateZi: r.lateZi,
        birthDate,
        note,
      },
    };
  }

  // 时辰模式
  const hour = form.shichen;
  if (hour === 0 && form.ziVariant === 'next') {
    const r = resolveChartDate(year, month, day, 23, 0);
    return {
      ok: true,
      resolved: {
        year: r.year,
        month: r.month,
        day: r.day,
        hour: r.hour,
        lateZi: true,
        birthDate,
        note: `晚子时（23:00–23:59）已按传统规则顺延至次日 ${formatDate(r.year, r.month, r.day)} 排盘`,
      },
    };
  }
  return {
    ok: true,
    resolved: {
      year,
      month,
      day,
      hour,
      lateZi: false,
      birthDate,
      note: `按出生日 ${formatDate(year, month, day)} 直接以${SHICHEN_NAMES[hour]}时（${SHICHEN_RANGES[hour]}）排盘`,
    },
  };
}

/**
 * 时辰 → 钟点的代表值（用于两种输入方式互相切换时的联动）。
 * 取各时辰区间的中点；子时按归属分别取 00:30 / 23:30。
 */
export function shichenToClock(hour: number, variant: ZiVariant = 'same'): { hour: number; minute: number } {
  if (hour === 0) return variant === 'next' ? { hour: 23, minute: 30 } : { hour: 0, minute: 30 };
  const starts = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21];
  return { hour: starts[hour - 1], minute: 30 };
}

/** 钟点 → 时辰（含子时归属判定）。 */
export function clockToShichen(
  clockHour: number,
  clockMinute: number,
): { shichen: number; variant: ZiVariant } {
  const shichen = shichenFromClock(clockHour, clockMinute);
  if (shichen === 0) {
    return { shichen: 0, variant: isLateZi(clockHour) ? 'next' : 'same' };
  }
  return { shichen, variant: 'same' };
}

/** 某年某月的天数（用于日期选择器） */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 31;
  return new Date(year, month, 0).getDate();
}
