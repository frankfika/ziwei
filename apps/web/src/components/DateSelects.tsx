'use client';

/**
 * 年/月/日 三联输入 —— 替代原生 date 输入（部分浏览器是 mm/dd/yyyy 顺序，不适合中文用户）。
 * 年份可直接键入（两百项下拉硬滚太痛苦），月/日保留下拉；
 * 月份定了后天数自动收窄；已选日期超出新月份天数时清掉并就地说明（如 1 月 31 日 → 2 月）。
 */

import { useId, useState } from 'react';
import { FORM_COPY } from '@/lib/formCopy';
import { useLang } from '@/lib/lang';

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
  /** 挂在年输入框上的 id（label htmlFor 用） */
  id?: string;
}) {
  const [lang] = useLang();
  const copy = FORM_COPY[lang];
  const listId = useId();
  /** 换月把「日」清掉时的就地说明（下改一次有效，选日/改年后消失） */
  const [clearedHint, setClearedHint] = useState<string | null>(null);

  const daysInMonth =
    value.year && value.month &&
    Number(value.month) >= 1 && Number(value.month) <= 12
      ? new Date(Number(value.year), Number(value.month), 0).getDate()
      : 31;

  const selectCls = 'field-input min-w-0';
  return (
    <div>
      <div className="flex gap-2">
        <input
          {...(id ? { id } : {})}
          type="text"
          inputMode="numeric"
          autoComplete="bday-year"
          maxLength={4}
          list={listId}
          aria-label={copy.ariaYear}
          placeholder={copy.optionYear}
          className={`${selectCls} flex-1`}
          value={value.year}
          onChange={(e) => {
            setClearedHint(null);
            // 只允许数字，其他字符直接吞掉
            const year = e.target.value.replace(/\D/g, '');
            // 年份变了，已选的「日」可能超出新年份当月天数（闰年 2 月）
            const maxDay =
              year && value.month
                ? new Date(Number(year), Number(value.month), 0).getDate()
                : 31;
            const dayOverflow = value.day && Number(value.day) > maxDay;
            if (dayOverflow) setClearedHint(copy.dayCleared(Number(value.month), maxDay));
            onChange({
              ...value,
              year,
              ...(dayOverflow ? { day: '' } : {}),
            });
          }}
        />
        <datalist id={listId}>
          {Array.from({ length: yearMax - yearMin + 1 }, (_, i) => yearMax - i).map((y) => (
            <option key={y} value={y}>
              {copy.yearOption(y)}
            </option>
          ))}
        </datalist>
        <select
          aria-label={copy.ariaMonth}
          className={`${selectCls} w-20 shrink-0`}
          value={value.month}
          onChange={(e) => {
            const month = e.target.value;
            const maxDay = month && value.year ? new Date(Number(value.year), Number(month), 0).getDate() : 31;
            const dayOverflow = !!(value.day && Number(value.day) > maxDay);
            setClearedHint(dayOverflow && month ? copy.dayCleared(Number(month), maxDay) : null);
            onChange({
              ...value,
              month,
              ...(dayOverflow ? { day: '' } : {}),
            });
          }}
        >
          <option value="">{copy.optionMonth}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{copy.monthOption(m)}</option>
          ))}
        </select>
        <select
          aria-label={copy.ariaDay}
          className={`${selectCls} w-20 shrink-0`}
          value={value.day}
          onChange={(e) => {
            setClearedHint(null);
            onChange({ ...value, day: e.target.value });
          }}
        >
          <option value="">{copy.optionDay}</option>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{copy.dayOption(d)}</option>
          ))}
        </select>
      </div>
      {clearedHint && (
        <p className="mt-2 text-xs leading-relaxed text-ink-2" role="status">
          {clearedHint}
        </p>
      )}
    </div>
  );
}
