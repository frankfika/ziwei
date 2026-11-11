'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { startChart } from '@/app/actions';
import DateSelects from './DateSelects';
import ErrorAlert from './ErrorAlert';
import { chartUrl, MAX_ENTRIES, useHistory, type HistoryEntry } from '@/lib/history';
import {
  BirthFormState,
  EMPTY_FORM,
  SHICHEN_NAMES,
  SHICHEN_NAMES_EN,
  SHICHEN_RANGES,
  clockToShichen,
  formatClock,
  formatDate,
  resolveForm,
  shichenToClock,
} from '@/lib/birth';
import { FORM_COPY } from '@/lib/formCopy';
import { useLang } from '@/lib/lang';
import { DURATION, motionDuration, motionStyle, preferredScrollBehavior } from '@/lib/motion';

export type { BirthFormState };

/** Reports form pending to parent so an external sticky submit can mirror it. */
function FormPendingSync({ onPending }: { onPending: (pending: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => {
    onPending(pending);
  }, [pending, onPending]);
  return null;
}

/** 表单是否与空表单一致（决定回填前要不要先确认覆盖） */
function isPristine(form: BirthFormState): boolean {
  return (
    form.name === EMPTY_FORM.name &&
    form.year === EMPTY_FORM.year &&
    form.month === EMPTY_FORM.month &&
    form.day === EMPTY_FORM.day &&
    form.timeMode === EMPTY_FORM.timeMode &&
    form.shichen === EMPTY_FORM.shichen &&
    form.ziVariant === EMPTY_FORM.ziVariant &&
    form.clockHour === EMPTY_FORM.clockHour &&
    form.clockMinute === EMPTY_FORM.clockMinute &&
    form.gender === EMPTY_FORM.gender
  );
}

/** 底部浮层提示（回填成功等瞬态确认）：自动消失，不打断操作 */
function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-5 md:bottom-10"
    >
      <span className="max-w-full truncate rounded-full bg-ink px-4 py-2 text-xs text-paper shadow-[0_8px_24px_rgba(36,33,29,0.3)]">
        {text}
      </span>
    </div>
  );
}

function SubmitButton({
  canSubmit,
  pending,
  form,
  className,
  disabledLabel,
}: {
  canSubmit: boolean;
  pending: boolean;
  /** Associate with a form when rendered outside it (sticky bar). */
  form?: string;
  className?: string;
  /** Shown when submit is blocked (incomplete / invalid date). */
  disabledLabel?: string;
}) {
  const [lang] = useLang();
  const copy = FORM_COPY[lang];
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
      {pending ? (
        // 按钮态：同一 keyframes，压到 DURATION.submit = 120ms
        // （reduced-motion 下 motionDuration 收到 80ms，globals.css 也有 80ms 兜底）
        <span className="chart-submit" style={motionStyle(motionDuration(DURATION.submit))}>
          {copy.submitting}
        </span>
      ) : canSubmit ? (
        copy.submit
      ) : (
        (disabledLabel ?? copy.disabledDefault)
      )}
    </button>
  );
}

export default function BirthForm({
  indexedYears = [],
  initialForm,
  errorText = '',
}: {
  /** 服务端已建索引的年份；未覆盖时在选年处软提示 */
  indexedYears?: number[];
  /** Server Action 校验失败回跳时带回的原表单值，用来恢复现场 */
  initialForm?: Partial<BirthFormState>;
  /** Server Action 校验失败的双语提示（NewChartClient 已按语言查好） */
  errorText?: string;
}) {
  const [form, setForm] = useState<BirthFormState>(() => ({ ...EMPTY_FORM, ...initialForm }));
  const [formPending, setFormPending] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(!!errorText);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 移动端星册默认折叠；桌面端恒展开 */
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [lang] = useLang();
  const copy = FORM_COPY[lang];
  const { history, save, remove, rename, clear } = useHistory();
  const indexedSet = useMemo(() => new Set(indexedYears), [indexedYears]);
  const yearNum = Number(form.year);
  // 年份可键入：输入到一半（不足 4 位）不提示，免得边打字边闪「未覆盖」
  const yearNotCovered =
    form.year.length === 4 &&
    Number.isInteger(yearNum) &&
    indexedYears.length > 0 &&
    !indexedSet.has(yearNum);

  // 日期下拉的月份范围（有解读索引时限定在覆盖范围内）
  const yearMin = indexedYears.length > 0 ? indexedYears[0] : 1900;
  const yearMax = indexedYears.length > 0 ? indexedYears[indexedYears.length - 1] : 2100;

  const resolved = useMemo(() => resolveForm(form), [form]);

  // 浮层提示自动消失；卸载时清掉定时器
  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(() => setToast(null), 2200);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const patch = (next: Partial<BirthFormState>) => setForm((prev) => ({ ...prev, ...next }));

  /** 切换到「按钟点」：已选时辰时用其代表钟点预填；未选则保留原钟点 */
  const switchToClock = () => {
    if (form.shichen === '') {
      patch({ timeMode: 'clock' });
      return;
    }
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

  const onPickHistory = (entry: HistoryEntry) => {
    // 表单已有内容：先确认，别静默覆盖用户填了一半的东西
    if (!isPristine(form) && !window.confirm(copy.overwriteConfirm)) return;
    setForm({ ...EMPTY_FORM, ...entry.form });
    setAttemptedSubmit(false);
    setToast(copy.filledBack(entry.label));
    // app-shell 布局下页面滚动发生在 main 里（window 不滚）
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
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
  if (form.year === '') missingDateParts.push(copy.partYear);
  if (form.month === '') missingDateParts.push(copy.partMonth);
  if (form.day === '') missingDateParts.push(copy.partDay);
  const hasDateError = missingDateParts.length > 0;
  /** 时辰模式下时辰必选（钟点模式 type=time 恒有值） */
  const timeMissing = form.timeMode === 'shichen' && form.shichen === '';
  const missingParts = timeMissing ? [...missingDateParts, copy.partTime] : missingDateParts;
  const hasMissing = missingParts.length > 0;
  const dateValueInvalid = !resolved.ok && !hasMissing;
  /** 错误文案按 errorCode 查本域文案（birth.ts 里的中文 error 串保持不动，给 CLI 用） */
  const errorText2 = resolved.errorCode
    ? copy.errors[resolved.errorCode](
        resolved.errorCode === 'invalid-date'
          ? formatDate(Number(form.year), Number(form.month), Number(form.day))
          : undefined,
      )
    : '';
  const submitHint = resolved.ok
    ? copy.hintOk
    : hasMissing
      ? copy.hintMissingParts(copy.joinParts(missingParts))
      : errorText2
        ? errorText2
        : copy.hintInvalidDate;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <form
        id="birth-form"
        action={handleSubmit}
        className="panel panel-ritual p-6 pb-24 sm:p-8 md:pb-8"
        noValidate
      >
        <FormPendingSync onPending={setFormPending} />

        {errorText && <ErrorAlert>{errorText}</ErrorAlert>}

        {/* 姓名 */}
        <div className="mb-7 mt-1">
          <label className="field-label" htmlFor="zi-name">
            {copy.nameLabel}
          </label>
          <input
            id="zi-name"
            name="name"
            type="text"
            maxLength={24}
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            placeholder={copy.namePlaceholder}
            className="field-input"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        {/* 出生日期：年/月/日 三联下拉（DateSelects 共享组件） */}
        <div className="mb-7">
          <label className="field-label" htmlFor="zi-date">
            {copy.dateLabel}
          </label>
          <DateSelects
            id="zi-date"
            yearMin={yearMin}
            yearMax={yearMax}
            value={{ year: form.year, month: form.month, day: form.day }}
            onChange={(v) => patch(v)}
          />
          {/* 隐藏字段保持 Server Action 入参契约不变（DateSelects 内的下拉不带 name） */}
          <input type="hidden" name="year" value={form.year} />
          <input type="hidden" name="month" value={form.month} />
          <input type="hidden" name="day" value={form.day} />
          {attemptedSubmit && (!form.year || !form.month || !form.day || dateValueInvalid) && (
            <p
              id="birth-date-error"
              className="mt-2 text-xs text-danger"
              role="alert"
            >
              {hasDateError
                ? copy.dateIncomplete
                : errorText2}
            </p>
          )}
          {yearNotCovered && (
            <p
              className="mt-2 text-xs leading-relaxed text-ink-2"
              data-year-coverage="miss"
              role="status"
            >
              {copy.yearNotCovered}
            </p>
          )}
        </div>

        {/* 时辰 */}
        <div className="mb-7">
          <span className="field-label" id="birth-time-label">
            {copy.timeLabel}
          </span>

          <div
            className="mb-3 inline-flex rounded-lg border border-line bg-paper p-1"
            role="group"
            aria-labelledby="birth-time-label"
          >
            {(
              [
                { key: 'shichen', label: copy.modeShichen },
                { key: 'clock', label: copy.modeClock },
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
                {copy.shichenAria}
              </label>
              <select
                id="zi-shichen"
                className="field-input"
                value={form.shichen}
                onChange={(e) => handleShichenChange(Number(e.target.value))}
              >
                <option value="" disabled>
                  {copy.shichenPlaceholder}
                </option>
                {SHICHEN_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {copy.shichenOption(name, SHICHEN_NAMES_EN[i], SHICHEN_RANGES[i])}
                  </option>
                ))}
              </select>

              {form.shichen === 0 && (
                <div className="mt-3 rounded-lg border border-lineSoft bg-paper p-3">
                  <p className="mb-2 text-xs text-ink-2">
                    {copy.ziQuestion}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        { key: 'same', label: copy.ziSame, hint: copy.ziSameHint },
                        { key: 'next', label: copy.ziNext, hint: copy.ziNextHint },
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
                          <span className="block text-2xs text-ink-2">{opt.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {attemptedSubmit && timeMissing && (
                <p className="mt-2 text-xs text-danger" role="alert">
                  {copy.errors['missing-shichen']()}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="sr-only" htmlFor="zi-clock">
                {copy.clockAria}
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
            <p className="mt-3 text-xs leading-relaxed text-ink-2" role="status">
              {copy.chartDate(
                resolved.resolved.year,
                resolved.resolved.month,
                resolved.resolved.day,
                copy.shichen(
                  SHICHEN_NAMES[resolved.resolved.hour],
                  SHICHEN_NAMES_EN[resolved.resolved.hour],
                ),
              )}
              {resolved.resolved.lateZi && copy.chartDateLate}
            </p>
          )}
        </div>

        {/* 性别 */}
        <div className="mb-8">
          <span className="field-label" id="gender-label">
            {copy.genderLabel}
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
                  {copy.gender[g]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop submit — hidden on mobile so only sticky bar is tabbable */}
        <div className="hidden md:block">
          <SubmitButton
            canSubmit={resolved.ok}
            pending={formPending}
            disabledLabel={
              hasMissing
                ? copy.disabledDate(copy.joinParts(missingParts))
                : copy.disabledDateFix
            }
          />
        </div>
        <p
          id="chart-submit-status"
          className="mt-3 min-h-5 text-xs text-ink-2"
          aria-live={attemptedSubmit && !resolved.ok ? 'polite' : undefined}
        >
          {/* 信息完整时保持安静（「将按 X 年 X 月排盘」已在时辰区显示），别再重复一句 */}
          {resolved.ok ? '' : submitHint}
        </p>
      </form>

      {/* Mobile sticky submit — 常驻：表单不完整时禁用态并说明缺什么，不再消失 */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 print:hidden md:hidden" aria-busy={formPending || undefined}>
        <div className="pointer-events-auto border-t border-line/80 bg-surface-2/90 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto w-full max-w-6xl">
            <SubmitButton
              canSubmit={resolved.ok}
              pending={formPending}
              form="birth-form"
              disabledLabel={
                hasMissing
                  ? copy.disabledDate(copy.joinParts(missingParts))
                  : copy.disabledDateFix
              }
            />
          </div>
        </div>
      </div>

      {/* 星册 */}
      <aside className="panel p-5" aria-labelledby="history-heading">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 id="history-heading" className="text-xs font-medium tracking-wide2 text-ink-2">
              {copy.libraryTitle}
              {history.length > 0 && (
                <span className="ml-2 hidden font-normal text-ink-3 tabular-nums md:inline">
                  {copy.libraryCount(history.length)}
                </span>
              )}
            </h2>
            <p className="mt-1 text-2xs leading-relaxed text-ink-2">
              {copy.libraryNote}
              {history.length >= MAX_ENTRIES && copy.libraryFull(MAX_ENTRIES)}
            </p>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(copy.libraryClearConfirm)) {
                  clear();
                }
              }}
              className="inline-flex min-h-9 shrink-0 items-center rounded-lg px-3 py-2 text-2xs text-ink-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {copy.libraryClear}
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="flex items-center gap-3 py-1">
            <p className="text-2xs leading-relaxed text-ink-2">{copy.libraryEmpty}</p>
          </div>
        ) : (
          <>
            {/* 移动端默认折叠成一行；桌面端隐藏此开关 */}
            <button
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              aria-expanded={libraryOpen}
              aria-controls="history-list"
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-lineSoft bg-paper/40 px-3 py-2 text-2xs text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu md:hidden"
            >
              <span>{copy.librarySaved(history.length)}</span>
              <span className="flex items-center gap-1">
                {libraryOpen ? copy.collapse : copy.expand}
                <span
                  aria-hidden="true"
                  className={`transition-transform ${libraryOpen ? 'rotate-180' : ''}`}
                >
                  ▾
                </span>
              </span>
            </button>

            <ul
              id="history-list"
              className={`${libraryOpen ? 'block' : 'hidden'} max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5 md:block`}
            >
              {history.map((entry) => {
                const url = chartUrl(entry.form);
                return (
                  <li key={entry.id}>
                    {/*
                      行语义：点行 = 回填到表单（主操作，本页就是表单）；
                      「命盘」链接直达盘页；重命名 / 删除是两个独立小按钮。
                    */}
                    <div className="group flex items-center gap-1">
                      <button
                        type="button"
                        title={copy.fillBackTitle}
                        aria-label={copy.fillBack(entry.label)}
                        onClick={() => onPickHistory(entry)}
                        className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-lg border border-lineSoft bg-paper/50 px-3 py-1.5 text-left transition-colors hover:border-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        <span className="block truncate text-xs text-ink">{entry.label}</span>
                        <span className="mt-0.5 block truncate text-2xs text-ink-2">
                          {copy.entryDate(
                            Number(entry.form.year),
                            Number(entry.form.month),
                            Number(entry.form.day),
                          )}
                          {' · '}
                          {entry.form.timeMode === 'clock'
                            ? `${formatClock(Number(entry.form.clockHour), Number(entry.form.clockMinute))}`
                            : entry.form.shichen === ''
                              ? copy.partTime
                              : copy.entryTimeShichen(
                                  SHICHEN_NAMES[entry.form.shichen],
                                  SHICHEN_NAMES_EN[entry.form.shichen],
                                )}
                          {' · '}
                          {copy.gender[entry.form.gender]}
                        </span>
                      </button>
                      {url && (
                        <Link
                          href={url}
                          title={copy.viewChartTitle}
                          className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-lineSoft bg-surface px-2.5 text-2xs text-zhu transition-colors hover:border-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                        >
                          {copy.viewChart}
                        </Link>
                      )}
                      <button
                        type="button"
                        aria-label={copy.rename(entry.label)}
                        title={copy.renameTitle}
                        onClick={() => {
                          const next = window.prompt(copy.renamePrompt, entry.label);
                          if (next !== null) rename(entry.id, next);
                        }}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-2xs text-ink-2 transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                      <button
                        type="button"
                        aria-label={copy.remove(entry.label)}
                        title={copy.removeTitle}
                        onClick={() => remove(entry.id)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm text-ink-2 transition-colors hover:bg-zhu-soft/40 hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>

      {toast && <Toast text={toast} />}
    </div>
  );
}
