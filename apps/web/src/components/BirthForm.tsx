'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { startChart } from '@/app/actions';
import { chartUrl, useHistory } from '@/lib/history';
import {
  BirthFormState,
  EMPTY_FORM,
  GENDER_LABEL,
  SHICHEN_NAMES,
  SHICHEN_RANGES,
  clockToShichen,
  formatClock,
  formatDate,
  resolveForm,
  shichenToClock,
} from '@/lib/birth';
import { preferredScrollBehavior } from '@/lib/motion';

export type { BirthFormState };

/** Reports form pending to parent so an external sticky submit can mirror it. */
function FormPendingSync({ onPending }: { onPending: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPending(pending);
  }, [pending, onPending]);
  return null;
}

function SubmitButton({
  canSubmit,
  pending,
  form,
  className,
  disabledLabel = '请先填完整生辰',
}: {
  canSubmit: boolean;
  pending: boolean;
  /** Associate with a form when rendered outside it (sticky bar). */
  form?: string;
  className?: string;
  /** Shown when submit is blocked (incomplete / invalid date). */
  disabledLabel?: string;
}) {
  return (
    <button
      type="submit"
      form={form}
      className={`btn-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${!canSubmit && !pending ? 'cursor-not-allowed opacity-50' : ''} ${className ?? ''}`}
      disabled={pending}
      aria-disabled={!canSubmit || undefined}
      aria-busy={pending || undefined}
      aria-describedby="chart-submit-status"
    >
      {pending ? '排盘中…' : canSubmit ? '排 盘' : disabledLabel}
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
  const [formPending, setFormPending] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const { history, save, remove, rename, clear } = useHistory();
  const indexedSet = useMemo(() => new Set(indexedYears), [indexedYears]);
  const yearNum = Number(form.year);
  const yearNotCovered =
    form.year !== '' &&
    Number.isInteger(yearNum) &&
    indexedYears.length > 0 &&
    !indexedSet.has(yearNum);

  // 日期输入：值与可选手范围（有索引时限定在覆盖范围内）
  const dateValue =
    form.year && form.month && form.day
      ? formatDate(Number(form.year), Number(form.month), Number(form.day))
      : '';
  const minDate = indexedYears.length > 0 ? `${indexedYears[0]}-01-01` : '1900-01-01';
  const maxDate =
    indexedYears.length > 0
      ? `${indexedYears[indexedYears.length - 1]}-12-31`
      : '2100-12-31';

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
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  /** 提交：先记入本地历史，再由 Server Action 用引擎口径算出排盘日并跳转 */
  const handleSubmit = async (formData: FormData) => {
    if (!resolved.ok) {
      setAttemptedSubmit(true);
      return;
    }

    setAttemptedSubmit(false);
    save(form);
    await startChart(formData);
  };

  const missingDateParts: string[] = [];
  if (form.year === '') missingDateParts.push('年');
  if (form.month === '') missingDateParts.push('月');
  if (form.day === '') missingDateParts.push('日');
  const hasDateError = missingDateParts.length > 0;
  const dateValueInvalid = !resolved.ok && !hasDateError;
  const submitHint = resolved.ok
    ? '提交后生成你的命盘与解读。'
    : hasDateError
      ? `请先选择出生${missingDateParts.join('、')}，再排盘。`
      : resolved.error
        ? resolved.error
        : '请先填写有效的出生日期。';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form
        id="birth-form"
        action={handleSubmit}
        className={`panel p-6 sm:p-8${resolved.ok ? ' pb-24 md:pb-8' : ''}`}
        noValidate
      >
        <FormPendingSync onPending={setFormPending} />

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
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="仅用于显示，不影响排盘"
            className="field-input"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        {/* 出生日期 */}
        <div className="mb-7">
          <label className="field-label" htmlFor="zi-date">
            出生日期（公历）
          </label>
          <input
            id="zi-date"
            type="date"
            className="field-input"
            value={dateValue}
            min={minDate}
            max={maxDate}
            aria-invalid={attemptedSubmit && (!form.year || dateValueInvalid) ? true : undefined}
            aria-describedby={attemptedSubmit && !resolved.ok ? 'birth-date-error' : undefined}
            onChange={(e) => {
              const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.target.value);
              patch(
                m
                  ? { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) }
                  : { year: '', month: '', day: '' },
              );
            }}
          />
          {/* 隐藏字段保持 Server Action 入参契约不变 */}
          <input type="hidden" name="year" value={form.year} />
          <input type="hidden" name="month" value={form.month} />
          <input type="hidden" name="day" value={form.day} />
          {attemptedSubmit && resolved.ok === false && (
            <p
              id="birth-date-error"
              className="mt-2 text-xs text-zhu"
              role="alert"
            >
              {hasDateError
                ? '请选择完整的公历出生日期。'
                : resolved.error}
            </p>
          )}
          {yearNotCovered && (
            <p
              className="mt-2 text-xs leading-relaxed text-ink-2"
              data-year-coverage="miss"
              role="status"
            >
              这一年暂时没有解读 —— 仍可排盘看十二宫。
            </p>
          )}
        </div>

        {/* 时辰 */}
        <div className="mb-7">
          <span className="field-label" id="birth-time-label">
            出生时辰
          </span>

          <div
            className="mb-3 inline-flex rounded-lg border border-line bg-paper p-1"
            role="group"
            aria-labelledby="birth-time-label"
          >
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
                  aria-pressed={active}
                  onClick={tab.key === 'clock' ? switchToClock : switchToShichen}
                  className={`inline-flex min-h-9 items-center rounded-md px-4 py-1.5 text-xs tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
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
                    子时跨零点，你出生在哪一段？
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
                          aria-pressed={active}
                          onClick={() => patch({ ziVariant: opt.key })}
                          className={`inline-flex min-h-11 flex-col justify-center rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
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
            <div>
              <label className="sr-only" htmlFor="zi-clock">
                出生钟点
              </label>
              <input
                id="zi-clock"
                type="time"
                className="field-input"
                value={`${String(Number(form.clockHour) || 0).padStart(2, '0')}:${String(Number(form.clockMinute) || 0).padStart(2, '0')}`}
                onChange={(e) => {
                  const m = /^(\d{1,2}):(\d{2})/.exec(e.target.value);
                  if (m) handleClockChange(String(Number(m[1])), m[2]);
                }}
              />
              <input type="hidden" name="clockHour" value={form.clockHour} />
              <input type="hidden" name="clockMinute" value={form.clockMinute} />
            </div>
          )}

          {/* 排盘口径：一行人话，只在信息完整时显示 */}
          {resolved.ok && resolved.resolved && (
            <p className="mt-3 text-2xs leading-relaxed text-ink-3" role="status">
              将按 {resolved.resolved.year} 年 {resolved.resolved.month} 月{' '}
              {resolved.resolved.day} 日 {SHICHEN_NAMES[resolved.resolved.hour]}时 排盘
              {resolved.resolved.lateZi && '（晚子时，已顺延到次日）'}
            </p>
          )}
        </div>

        {/* 性别 */}
        <div className="mb-8">
          <span className="field-label" id="gender-label">
            性别
          </span>
          <input type="hidden" name="gender" value={form.gender} />
          <div
            className="grid grid-cols-2 gap-3"
            role="group"
            aria-labelledby="gender-label"
          >
            {(['male', 'female'] as const).map((g) => {
              const active = form.gender === g;
              return (
                <button
                  key={g}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patch({ gender: g })}
                  className={`inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
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

        {/* Desktop submit — hidden on mobile so only sticky bar is tabbable */}
        <div className={resolved.ok ? 'hidden md:block' : undefined}>
          <SubmitButton
            canSubmit={resolved.ok}
            pending={formPending}
            disabledLabel={
              hasDateError
                ? `请先选择${missingDateParts.join('、')}`
                : '请修正出生日期'
            }
          />
        </div>
        <p
          id="chart-submit-status"
          className={`mt-3 min-h-5 text-2xs text-ink-3${resolved.ok ? ' max-md:sr-only' : ''}`}
          aria-live={attemptedSubmit && !resolved.ok ? 'polite' : undefined}
        >
          {submitHint}
        </p>
      </form>

      {/* Mobile sticky submit — outside panel padding; still owns form via form= */}
      {resolved.ok && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 print:hidden md:hidden" aria-busy={formPending || undefined}>
          <div className="pointer-events-auto border-t border-line bg-surface/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="mx-auto w-full max-w-6xl">
              <SubmitButton canSubmit pending={formPending} form="birth-form" />
            </div>
          </div>
        </div>
      )}

      {/* 我的命盘 */}
      <aside className="panel p-5" aria-labelledby="history-heading">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="history-heading" className="text-xs font-medium tracking-wide2 text-ink-2">
            我的命盘
            {history.length > 0 && (
              <span className="ml-2 font-normal text-ink-3 tabular-nums">{history.length} 张</span>
            )}
          </h2>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('清空全部已存命盘？')) {
                  clear();
                }
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-3 py-2 text-2xs text-ink-3 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              清空
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-paper px-3 py-4">
            <p className="text-2xs leading-relaxed text-ink-3">
              排过的盘会自动存在这里（只存在本机），家人朋友的盘随时点开回看、继续追问。
            </p>
          </div>
        ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {history.map((entry) => {
              const url = chartUrl(entry.form);
              return (
                <li key={entry.id}>
                  <div className="group flex items-start gap-2">
                    <a
                      href={url ?? '#'}
                      onClick={(e) => {
                        if (!url) {
                          e.preventDefault();
                          onPickHistory(entry.form);
                        }
                      }}
                      className="flex min-h-11 flex-1 flex-col justify-center rounded-lg border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                    >
                      <span className="block truncate text-xs text-ink">{entry.label}</span>
                      <span className="mt-0.5 block text-2xs text-ink-3">
                        {entry.form.year}年{entry.form.month}月{entry.form.day}日
                        {' · '}
                        {entry.form.timeMode === 'clock'
                          ? `${formatClock(Number(entry.form.clockHour), Number(entry.form.clockMinute))}`
                          : `${SHICHEN_NAMES[entry.form.shichen]}时`}
                        {' · '}
                        {GENDER_LABEL[entry.form.gender]}
                      </span>
                    </a>
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label={`回填「${entry.label}」到表单`}
                        title="回填到表单修改"
                        onClick={() => onPickHistory(entry.form)}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-2xs text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        填
                      </button>
                      <button
                        type="button"
                        aria-label={`重命名「${entry.label}」`}
                        title="重命名"
                        onClick={() => {
                          const next = window.prompt('给这张盘起个名字（如「妈妈的盘」）', entry.label);
                          if (next !== null) rename(entry.id, next);
                        }}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-2xs text-ink-3 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        名
                      </button>
                      <button
                        type="button"
                        aria-label={`删除「${entry.label}」`}
                        title="删除"
                        onClick={() => remove(entry.id)}
                        className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-sm text-ink-3 transition-colors hover:bg-zhu-soft/40 hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
