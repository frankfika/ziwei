'use client';

/**
 * 合盘表单：两个人的生辰录入。
 *
 * - 支持 URL 参数回填（结果页「修改参数」回来不用重输）
 * - 星册档案一键填入：点名字就填好整组字段
 */

import { useMemo, useState } from 'react';
import DateSelects from './DateSelects';
import { useHistory } from '@/lib/history';
import { resolveForm, SHICHEN_NAMES } from '@/lib/birth';

export interface SynastryPerson {
  name: string;
  gender: 'male' | 'female';
  /** YYYY-MM-DD */
  date: string;
  hour: string;
}

interface SynastryFormProps {
  initialA?: Partial<SynastryPerson>;
  initialB?: Partial<SynastryPerson>;
}

const EMPTY: SynastryPerson = { name: '', gender: 'male', date: '', hour: '4' };

export default function SynastryForm({ initialA, initialB }: SynastryFormProps) {
  const { history } = useHistory();
  const [a, setA] = useState<SynastryPerson>({ ...EMPTY, ...initialA });
  const [b, setB] = useState<SynastryPerson>({ ...EMPTY, ...initialB });

  const fillFrom =
    (set: (p: SynastryPerson) => void) =>
    (id: string): void => {
      const entry = history.find((e) => e.id === id);
      if (!entry) return;
      const r = resolveForm(entry.form);
      if (!r.ok || !r.resolved) return;
      const { year, month, day, hour } = r.resolved;
      set({
        name: entry.form.name.trim(),
        gender: entry.form.gender,
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        hour: String(hour),
      });
    };

  /** 星册里可用来填表的人的候选（按档案去重后） */
  const candidates = useMemo(
    () =>
      history
        .map((e) => {
          const r = resolveForm(e.form);
          return r.ok && r.resolved ? { id: e.id, label: e.label } : null;
        })
        .filter((x): x is { id: string; label: string } => !!x),
    [history],
  );

  const submit = () => {
    if (!a.date || !b.date) return;
    const params = new URLSearchParams({
      an: a.name, ag: a.gender, ad: a.date, ah: a.hour,
      bn: b.name, bg: b.gender, bd: b.date, bh: b.hour,
    });
    window.location.href = `/synastry?${params.toString()}`;
  };

  const field = (
    person: SynastryPerson,
    set: (p: SynastryPerson) => void,
    prefix: 'a' | 'b',
  ) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="field-label">姓名（可选）</span>
        <input
          name={`${prefix}n`}
          value={person.name}
          onChange={(e) => set({ ...person, name: e.target.value })}
          className="field-input"
          placeholder={prefix === 'a' ? '如：小张' : '如：小李'}
        />
      </label>
      <label className="block">
        <span className="field-label">性别</span>
        <select
          name={`${prefix}g`}
          value={person.gender}
          onChange={(e) => set({ ...person, gender: e.target.value as 'male' | 'female' })}
          className="field-input"
        >
          <option value="male">男</option>
          <option value="female">女</option>
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="field-label">出生日期（公历）</span>
        <DateSelects
          value={{ year: person.date.slice(0, 4), month: String(Number(person.date.slice(5, 7)) || ''), day: String(Number(person.date.slice(8, 10)) || '') }}
          onChange={(v) =>
            set({
              ...person,
              date: v.year && v.month && v.day
                ? `${v.year}-${v.month.padStart(2, '0')}-${v.day.padStart(2, '0')}`
                : '',
            })
          }
        />
      </label>
      <label className="block">
        <span className="field-label">出生时辰</span>
        <select
          name={`${prefix}h`}
          value={person.hour}
          onChange={(e) => set({ ...person, hour: e.target.value })}
          className="field-input"
        >
          {SHICHEN_NAMES.map((s, i) => (
            <option key={s} value={i}>
              {s}时
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <div className="space-y-6" data-synastry-form>
      {(['a', 'b'] as const).map((prefix, idx) => {
        const person = prefix === 'a' ? a : b;
        const set = prefix === 'a' ? setA : setB;
        return (
          <fieldset key={prefix} className="panel p-5">
            <legend className="px-1 text-xs font-medium tracking-wide2 text-ink">
              {idx === 0 ? '甲方' : '乙方'}
            </legend>
            {candidates.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-2xs text-ink-3">从档案选：</span>
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => fillFrom(set)(c.id)}
                    className="rounded-full border border-line bg-surface px-2 py-1 text-2xs leading-none text-ink-2 transition-colors hover:border-zhu hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
            {field(person, set, prefix)}
          </fieldset>
        );
      })}
      <button
        type="button"
        onClick={submit}
        disabled={!a.date || !b.date}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-45"
      >
        看合盘
      </button>
    </div>
  );
}
