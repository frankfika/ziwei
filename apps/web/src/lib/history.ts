import { useEffect, useState, useCallback } from 'react';
import type { BirthFormState } from '@/lib/birth';
import { GENDER_LABEL, SHICHEN_NAMES, formatClock, resolveForm } from '@/lib/birth';

const STORAGE_KEY = 'ziwei_history';
const MAX_ENTRIES = 10;

export interface HistoryEntry {
  id: string;
  label: string;
  form: BirthFormState;
  savedAt: number;
}

/** 一张盘的唯一标识：排盘日 + 时辰序号 + 性别 */
function chartIdentity(form: BirthFormState): string {
  const r = resolveForm(form);
  if (r.ok && r.resolved) {
    const { year, month, day, hour } = r.resolved;
    return `${year}-${month}-${day}-${hour}-${form.gender}`;
  }
  return `${form.year}-${form.month}-${form.day}-${form.shichen}-${form.gender}`;
}

function buildLabel(form: BirthFormState): string {
  const time =
    form.timeMode === 'clock'
      ? formatClock(Number(form.clockHour), Number(form.clockMinute))
      : `${SHICHEN_NAMES[form.shichen]}时`;
  return [
    form.name,
    `${form.year}年${form.month}月${form.day}日`,
    time,
    GENDER_LABEL[form.gender],
  ]
    .filter(Boolean)
    .join(' · ');
}

function readStore(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStore(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 忽略写入失败（隐私模式 / 配额满） */
  }
}

/** 同一张盘（排盘日 + 时辰序号 + 性别）只保留一条，新的排在最前 */
function nextList(prev: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const identity = chartIdentity(entry.form);
  const deduped = prev.filter((e) => chartIdentity(e.form) !== identity);
  return [entry, ...deduped].slice(0, MAX_ENTRIES);
}

/**
 * 本地排盘历史 —— 只存在浏览器 localStorage，不上传。
 *
 * 写入走 localStorage 本身而不是 React state updater：提交后页面会立刻重定向，
 * state updater 不保证在卸载前执行，落盘必须同步完成。
 */
export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(readStore());
  }, []);

  const save = useCallback((form: BirthFormState) => {
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label: buildLabel(form),
      form,
      savedAt: Date.now(),
    };
    const updated = nextList(readStore(), entry);
    writeStore(updated);
    setHistory(updated);
  }, []);

  const remove = useCallback((id: string) => {
    const updated = readStore().filter((e) => e.id !== id);
    writeStore(updated);
    setHistory(updated);
  }, []);

  return { history, save, remove };
}
