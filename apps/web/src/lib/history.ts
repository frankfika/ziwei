import { useEffect, useState, useCallback } from 'react';
import type { BirthFormState } from '@/lib/birth';
import { GENDER_LABEL, SHICHEN_NAMES, formatClock, formatDate, resolveForm } from '@/lib/birth';

const STORAGE_KEY = 'ziwei_history';
/** 星册最多存的张数（超出时挤掉最早的，界面会提示） */
export const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  label: string;
  form: BirthFormState;
  savedAt: number;
}

/** 与命盘页 URL 参数一致的身份串（排盘日 + 时辰序号 + 性别） */
export function chartKey(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: string;
}): string {
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}-${parts.gender}`;
}

/** 一张盘的唯一标识：排盘日 + 时辰序号 + 性别 */
function chartIdentity(form: BirthFormState): string {
  const r = resolveForm(form);
  if (r.ok && r.resolved) {
    return chartKey({ ...r.resolved, gender: form.gender });
  }
  return `${form.year}-${form.month}-${form.day}-${form.shichen}-${form.gender}`;
}

/** 生成命盘页直达链接；表单无法解析时返回 null */
export function chartUrl(form: BirthFormState): string | null {
  const r = resolveForm(form);
  if (!r.ok || !r.resolved) return null;
  const { year, month, day, hour, lateZi, birthDate } = r.resolved;
  const params = new URLSearchParams({
    y: String(year),
    m: String(month),
    d: String(day),
    h: String(hour),
    g: form.gender,
  });
  if (form.name.trim()) params.set('n', form.name.trim());
  if (lateZi) {
    params.set('late', '1');
    params.set('bd', formatDate(birthDate.year, birthDate.month, birthDate.day));
  }
  return `/chart?${params.toString()}`;
}

function buildLabel(form: BirthFormState): string {
  return [form.name, detailLabel(form)].filter(Boolean).join(' · ');
}

/** 档案详情行：生辰 + 时辰 + 性别（不含名字） */
export function detailLabel(form: BirthFormState): string {
  const time =
    form.timeMode === 'clock'
      ? formatClock(Number(form.clockHour), Number(form.clockMinute))
      : `${SHICHEN_NAMES[form.shichen]}时`;
  return `${form.year}年${form.month}月${form.day}日 · ${time} · ${GENDER_LABEL[form.gender]}`;
}

/**
 * 档案显示名：录入时起的名字优先；没名字时若被改过名就用改后的名字，否则空。
 */
export function displayName(entry: HistoryEntry): string {
  const named = entry.form.name.trim();
  if (named) return named;
  return entry.label === buildLabel(entry.form) ? '' : entry.label;
}

/** 芯片上的短名：显示名优先，没有就用生辰 */
export function shortLabel(entry: HistoryEntry): string {
  return displayName(entry) || `${entry.form.year}/${entry.form.month}/${entry.form.day}`;
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

/** 档案库变更事件：写入方广播，订阅方（如常驻布局的悬浮面板）据此重读 */
export const HISTORY_EVENT = 'ziwei:history';

function writeStore(list: HistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(HISTORY_EVENT));
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
 * 本地命盘库 —— 只存在浏览器 localStorage，不上传。
 *
 * 写入走 localStorage 本身而不是 React state updater：提交后页面会立刻重定向，
 * state updater 不保证在卸载前执行，落盘必须同步完成。
 */
export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  /** 首次读盘完成。挂载第一帧 history 恒为 []，不能拿它判断"用户没有档案" */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reread = () => {
      setHistory(readStore());
      setReady(true);
    };
    reread();
    // 常驻布局组件跨软导航不重挂载：监听写入广播与跨 tab 的 storage 事件，保持最新
    window.addEventListener(HISTORY_EVENT, reread);
    window.addEventListener('storage', reread);
    return () => {
      window.removeEventListener(HISTORY_EVENT, reread);
      window.removeEventListener('storage', reread);
    };
  }, []);

  const save = useCallback((form: BirthFormState) => {
    const entry: HistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      label: buildLabel(form),
      form,
      savedAt: Date.now(),
    };
    // 同一张盘被再次排过时：保留用户改过的名字，只更新时间与排前
    const existing = readStore().find(
      (e) => chartIdentity(e.form) === chartIdentity(entry.form),
    );
    if (existing && existing.label !== entry.label && existing.label !== buildLabel(existing.form)) {
      entry.label = existing.label;
    }
    const updated = nextList(readStore(), entry);
    writeStore(updated);
    setHistory(updated);
  }, []);

  const remove = useCallback((id: string) => {
    const updated = readStore().filter((e) => e.id !== id);
    writeStore(updated);
    setHistory(updated);
  }, []);

  const rename = useCallback((id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const updated = readStore().map((e) => (e.id === id ? { ...e, label: trimmed } : e));
    writeStore(updated);
    setHistory(updated);
  }, []);

  const clear = useCallback(() => {
    writeStore([]);
    setHistory([]);
  }, []);

  return { history, ready, save, remove, rename, clear };
}
