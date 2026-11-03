'use client';

/**
 * 年/月/日 三联下拉 —— 替代原生 date 输入（部分浏览器是 mm/dd/yyyy 顺序，不适合中文用户）。
 * 月份定了后天数自动收窄；已选日期超出新月份天数时一并清掉（如 1 月 31 日 → 2 月）。
 */

export interface DateParts {
  year: string;
  month: string;
  day: string;
}

export default function DateSelects({
  value,
  onChange,
  yearMin = 1900,
  yearMax = 2100,
  id,
}: {
  value: DateParts;
  onChange: (v: DateParts) => void;
  /** 有解读索引时把可覆盖年份传进来，选年处软限定 */
  yearMin?: number;
  yearMax?: number;
  /** 挂在年下拉上的 id（label htmlFor 用） */
  id?: string;
}) {
  const years = Array.from({ length: yearMax - yearMin + 1 }, (_, i) => yearMax - i);
  const daysInMonth =
    value.year && value.month &&
    Number(value.month) >= 1 && Number(value.month) <= 12
      ? new Date(Number(value.year), Number(value.month), 0).getDate()
      : 31;

  const selectCls = 'field-input min-w-0';
  return (
    <div className="flex gap-2">
      <select
        {...(id ? { id } : {})}
        aria-label="出生年份"
        className={`${selectCls} flex-1`}
        value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
      >
        <option value="">年</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}年</option>
        ))}
      </select>
      <select
        aria-label="出生月份"
        className={`${selectCls} w-20 shrink-0`}
        value={value.month}
        onChange={(e) => {
          const month = e.target.value;
          const maxDay = month && value.year ? new Date(Number(value.year), Number(month), 0).getDate() : 31;
          onChange({
            ...value,
            month,
            ...(value.day && Number(value.day) > maxDay ? { day: '' } : {}),
          });
        }}
      >
        <option value="">月</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>{m}月</option>
        ))}
      </select>
      <select
        aria-label="出生日期"
        className={`${selectCls} w-20 shrink-0`}
        value={value.day}
        onChange={(e) => onChange({ ...value, day: e.target.value })}
      >
        <option value="">日</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{d}日</option>
        ))}
      </select>
    </div>
  );
}
