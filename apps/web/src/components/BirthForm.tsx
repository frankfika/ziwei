'use client';

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { startChart } from '@/app/actions';
import { useHistory } from '@/lib/history';
import {
  BirthFormState,
  EMPTY_FORM,
  GENDER_LABEL,
  SHICHEN_NAMES,
  SHICHEN_RANGES,
  clockToShichen,
  daysInMonth,
  formatClock,
  formatDate,
  resolveForm,
  shichenToClock,
} from '@/lib/birth';

export type { BirthFormState };

const YEARS = Array.from({ length: 201 }, (_, i) => 1900 + i);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? '排盘中…' : '排 盘'}
    </button>
  );
}

export default function BirthForm({
  indexedYears = [],
}: {
  /** 服务端已建索引的年份；未覆盖时在选年处软提示 */
  indexedYears?: number[];
}) {
  const [form, setForm] = useState<BirthFormState>(EMPTY_FORM);
  const { history, save, remove } = useHistory();
  const indexedSet = useMemo(() => new Set(indexedYears), [indexedYears]);
  const yearNum = Number(form.year);
  const yearNotCovered =
    form.year !== '' &&
    Number.isInteger(yearNum) &&
    indexedYears.length > 0 &&
    !indexedSet.has(yearNum);

  const maxDay = useMemo(() => daysInMonth(Number(form.year), Number(form.month)), [
    form.year,
    form.month,
  ]);

  const resolved = useMemo(() => resolveForm(form), [form]);

  const patch = (next: Partial<BirthFormState>) => setForm((prev) => ({ ...prev, ...next }));

  /** 切换到「按钟点」：用当前时辰的代表钟点预填 */
  const switchToClock = () => {
    const c = shichenToClock(form.shichen, form.ziVariant);
    patch({
      timeMode: 'clock',
      clockHour: String(c.hour),
      clockMinute: String(c.minute),
    });
  };

  /** 切换到「按时辰」：用当前钟点反推时辰 */
  const switchToShichen = () => {
    const h = Number(form.clockHour);
    const m = Number(form.clockMinute);
    if (!Number.isFinite(h) || !Number.isFinite(m)) {
      patch({ timeMode: 'shichen' });
      return;
    }
    const { shichen, variant } = clockToShichen(h, m);
    patch({ timeMode: 'shichen', shichen, ziVariant: variant });
  };

  const handleShichenChange = (value: number) => {
    patch({ shichen: value });
  };

  const handleClockChange = (clockHour: string, clockMinute: string) => {
    patch({ clockHour, clockMinute });
  };

  const onPickHistory = (entry: BirthFormState) => {
    setForm({ ...EMPTY_FORM, ...entry });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** 提交：先记入本地历史，再由 Server Action 用引擎口径算出排盘日并跳转 */
  const handleSubmit = async (formData: FormData) => {
    if (resolved.ok) save(form);
    await startChart(formData);
  };

  const timeModeHint =
    form.timeMode === 'shichen'
      ? '时辰下拉与解读数据集严格对齐：排盘日即你填写的公历出生日，时辰序号 0–11。'
      : '钟点会先换算成「排盘日 + 时辰序号」再检索数据集，23:00 后自动按晚子时顺延到次日。';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form action={handleSubmit} className="panel p-6 sm:p-8">
        {/* 姓名 */}
        <div className="mb-7">
          <label className="field-label" htmlFor="zi-name">
            姓名（可选）
          </label>
          <input
            id="zi-name"
            name="name"
            type="text"
            maxLength={24}
            autoComplete="off"
            placeholder="仅用于显示，不影响排盘"
            className="field-input"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        {/* 出生日期 */}
        <div className="mb-7">
          <span className="field-label">出生日期（公历）</span>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="sr-only" htmlFor="zi-year">
                年
              </label>
              <select
                id="zi-year"
                name="year"
                className="field-input"
                value={form.year}
                onChange={(e) => patch({ year: e.target.value })}
              >
                <option value="">年</option>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y} 年
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="sr-only" htmlFor="zi-month">
                月
              </label>
              <select
                id="zi-month"
                name="month"
                className="field-input"
                value={form.month}
                onChange={(e) => patch({ month: e.target.value })}
              >
                <option value="">月</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} 月
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="sr-only" htmlFor="zi-day">
                日
              </label>
              <select
                id="zi-day"
                name="day"
                className="field-input"
                value={form.day}
                onChange={(e) => patch({ day: e.target.value })}
              >
                <option value="">日</option>
                {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d} 日
                  </option>
                ))}
              </select>
            </div>
          </div>
          {resolved.ok === false && (
            <p className="mt-2 text-xs text-zhu">{resolved.error}</p>
          )}
          {yearNotCovered && (
            <p className="mt-2 text-xs leading-relaxed text-ink-3" data-year-coverage="miss">
              样本库尚未索引 {yearNum}{' '}
              年——仍可排盘看十二宫，但十三维解读会提示「未覆盖」。已建索引：
              {indexedYears.length <= 16
                ? indexedYears.join(' / ')
                : `${indexedYears[0]}–${indexedYears[indexedYears.length - 1]}（共 ${indexedYears.length} 年）`}
              。
            </p>
          )}
        </div>

        {/* 时辰 */}
        <div className="mb-7">
          <span className="field-label">出生时辰</span>

          <div className="mb-3 inline-flex rounded-lg border border-line bg-paper p-1">
            {(
              [
                { key: 'shichen', label: '按时辰' },
                { key: 'clock', label: '按钟点' },
              ] as const
            ).map((tab) => {
              const active = form.timeMode === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={tab.key === 'clock' ? switchToClock : switchToShichen}
                  className={`rounded-md px-4 py-1.5 text-xs tracking-wide transition-colors ${
                    active
                      ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(36,33,29,0.08)]'
                      : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <input type="hidden" name="timeMode" value={form.timeMode} />
          <input type="hidden" name="shichen" value={form.shichen} />
          <input type="hidden" name="ziVariant" value={form.ziVariant} />

          {form.timeMode === 'shichen' ? (
            <div>
              <label className="sr-only" htmlFor="zi-shichen">
                时辰
              </label>
              <select
                id="zi-shichen"
                className="field-input"
                value={form.shichen}
                onChange={(e) => handleShichenChange(Number(e.target.value))}
              >
                {SHICHEN_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}时（{SHICHEN_RANGES[i]}）
                  </option>
                ))}
              </select>

              {form.shichen === 0 && (
                <div className="mt-3 rounded-lg border border-lineSoft bg-paper p-3">
                  <p className="mb-2 text-xs text-ink-2">
                    子时横跨两日，请确认归属：
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        { key: 'same', label: '当日子时', hint: '00:00–00:59' },
                        { key: 'next', label: '晚子时', hint: '23:00–23:59 · 按次日排盘' },
                      ] as const
                    ).map((opt) => {
                      const active = form.ziVariant === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => patch({ ziVariant: opt.key })}
                          className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                            active
                              ? 'border-zhu bg-zhu-soft text-ink'
                              : 'border-line bg-surface text-ink-2 hover:border-ink-3'
                          }`}
                        >
                          <span className="block text-xs font-medium">{opt.label}</span>
                          <span className="block text-2xs text-ink-3">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="sr-only" htmlFor="zi-clock-hour">
                  时
                </label>
                <select
                  id="zi-clock-hour"
                  name="clockHour"
                  className="field-input"
                  value={form.clockHour}
                  onChange={(e) => handleClockChange(e.target.value, form.clockMinute)}
                >
                  {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')} 时
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor="zi-clock-minute">
                  分
                </label>
                <select
                  id="zi-clock-minute"
                  name="clockMinute"
                  className="field-input"
                  value={form.clockMinute}
                  onChange={(e) => handleClockChange(form.clockHour, e.target.value)}
                >
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')} 分
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 口径提示 */}
          <div className="mt-3 rounded-lg border border-lineSoft bg-paper px-3.5 py-3">
            <p className="text-2xs tracking-wide2 text-ink-3">当前口径</p>
            {resolved.ok && resolved.resolved ? (
              <>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">
                  {resolved.resolved.note}
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-3">
                  排盘日 {formatDate(resolved.resolved.year, resolved.resolved.month, resolved.resolved.day)}
                  {' · '}时辰序号 {resolved.resolved.hour}（
                  {SHICHEN_NAMES[resolved.resolved.hour]}时 {SHICHEN_RANGES[resolved.resolved.hour]}）
                  {resolved.resolved.lateZi && ' · 晚子时已顺延'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-ink-3">填写出生日期后显示排盘口径。</p>
            )}
            <p className="mt-2 border-t border-lineSoft pt-2 text-2xs leading-relaxed text-ink-3">
              {timeModeHint}
            </p>
          </div>
        </div>

        {/* 性别 */}
        <div className="mb-8">
          <span className="field-label">性别</span>
          <input type="hidden" name="gender" value={form.gender} />
          <div className="grid grid-cols-2 gap-3">
            {(['male', 'female'] as const).map((g) => {
              const active = form.gender === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => patch({ gender: g })}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? 'border-zhu bg-zhu-soft text-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {GENDER_LABEL[g]}
                </button>
              );
            })}
          </div>
        </div>

        <SubmitButton />
      </form>

      {/* 最近排盘 */}
      <aside className="panel p-5">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">最近排盘</h2>
        {history.length === 0 ? (
          <p className="text-2xs leading-relaxed text-ink-3">
            排过的盘会保存在本机浏览器里，方便下次直接打开。
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <div className="group flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => onPickHistory(entry.form)}
                    className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-left transition-colors hover:border-ink-3"
                  >
                    <span className="block truncate text-xs text-ink">{entry.label}</span>
                    <span className="mt-0.5 block text-2xs text-ink-3">
                      {entry.form.timeMode === 'clock'
                        ? `钟点 ${formatClock(Number(entry.form.clockHour), Number(entry.form.clockMinute))}`
                        : `${SHICHEN_NAMES[entry.form.shichen]}时`}
                      {' · '}
                      {GENDER_LABEL[entry.form.gender]}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="删除记录"
                    onClick={() => remove(entry.id)}
                    className="mt-1 rounded px-1 text-2xs text-ink-3 transition-colors hover:text-zhu"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
