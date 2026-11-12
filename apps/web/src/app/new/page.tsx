import NewChartClient from './NewChartClient';
import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const years = getService().coverage().indexedYears;
  const sp = await searchParams;

  // Server Action 校验失败会带 error + 原表单值回跳，原样传给表单恢复现场
  const raw: Record<string, string> = {};
  for (const key of [
    'name', 'year', 'month', 'day',
    'timeMode', 'shichen', 'ziVariant',
    'clockHour', 'clockMinute', 'gender',
  ]) {
    const v = one(sp[key]);
    if (v) raw[key] = v;
  }
  const errorKey = one(sp.error);

  return <NewChartClient indexedYears={years} rawForm={raw} errorKey={errorKey} />;
}
