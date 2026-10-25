'use server';

/**
 * 表单提交 —— 排盘口径的**权威**计算入口。
 *
 * 排盘日与时辰序号一律由引擎自带的 `resolveChartDate()` / `shichenFromClock()` 得出，
 * 浏览器端的镜像实现只用于表单内的实时预览，不参与最终计算。
 */
import { redirect } from 'next/navigation';
import { resolveChartDate, shichenFromClock } from '@ziwei/chart-engine';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export async function startChart(formData: FormData): Promise<void> {
  const name = str(formData, 'name').trim();
  const year = Number(str(formData, 'year'));
  const month = Number(str(formData, 'month'));
  const day = Number(str(formData, 'day'));
  const timeMode = str(formData, 'timeMode') === 'clock' ? 'clock' : 'shichen';
  const shichen = Number(str(formData, 'shichen'));
  const ziVariant = str(formData, 'ziVariant') === 'next' ? 'next' : 'same';
  const clockHour = Number(str(formData, 'clockHour'));
  const clockMinute = Number(str(formData, 'clockMinute'));
  const gender = str(formData, 'gender') === 'female' ? 'female' : 'male';

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    redirect('/?error=year');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    redirect('/?error=month');
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    redirect('/?error=day');
  }
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    redirect('/?error=date');
  }

  let chartYear = year;
  let chartMonth = month;
  let chartDay = day;
  let hour: number;
  let lateZi = false;

  if (timeMode === 'clock') {
    if (
      !Number.isInteger(clockHour) || clockHour < 0 || clockHour > 23 ||
      !Number.isInteger(clockMinute) || clockMinute < 0 || clockMinute > 59
    ) {
      redirect('/?error=clock');
    }
    const r = resolveChartDate(year, month, day, clockHour, clockMinute);
    chartYear = r.year;
    chartMonth = r.month;
    chartDay = r.day;
    hour = r.hour;
    lateZi = chartYear !== year || chartMonth !== month || chartDay !== day;
  } else {
    if (!Number.isInteger(shichen) || shichen < 0 || shichen > 11) {
      redirect('/?error=shichen');
    }
    if (shichen === 0 && ziVariant === 'next') {
      // 晚子时：按次日排盘（与钟点 23:xx 走同一条规则）
      const r = resolveChartDate(year, month, day, 23, 0);
      chartYear = r.year;
      chartMonth = r.month;
      chartDay = r.day;
      hour = r.hour;
      lateZi = true;
    } else {
      hour = shichen;
    }
  }

  // 兜底：确保时辰序号落在 0–11
  if (!Number.isInteger(hour) || hour < 0 || hour > 11) {
    hour = shichenFromClock(clockHour || 0, clockMinute || 0);
  }

  const params = new URLSearchParams({
    y: String(chartYear),
    m: String(chartMonth),
    d: String(chartDay),
    h: String(hour),
    g: gender,
  });
  if (name) params.set('n', name);
  if (lateZi) {
    params.set('late', '1');
    params.set('bd', `${year}-${pad(month)}-${pad(day)}`);
  }

  redirect(`/chart?${params.toString()}`);
}
