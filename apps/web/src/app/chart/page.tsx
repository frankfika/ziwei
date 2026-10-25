import Link from 'next/link';
import ChartBoard from '@/components/ChartBoard';
import ReadingPanel from '@/components/ReadingPanel';
import NotCoveredNotice from '@/components/NotCoveredNotice';
import { getService } from '@/lib/service';
import { GENDER_LABEL, SHICHEN_NAMES, SHICHEN_RANGES, formatDate } from '@/lib/birth';

export const dynamic = 'force-dynamic';

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function invalid(message: string) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="font-serif text-lg tracking-wide text-ink">无法排盘</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-[#8d3324]"
        >
          回到输入页
        </Link>
      </div>
    </div>
  );
}

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const year = Number(one(sp.y));
  const month = Number(one(sp.m));
  const day = Number(one(sp.d));
  const hour = Number(one(sp.h));
  const genderRaw = one(sp.g);
  const name = one(sp.n).trim();
  const lateFlag = one(sp.late) === '1';
  const birthDateRaw = one(sp.bd);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 11 ||
    (genderRaw !== 'male' && genderRaw !== 'female')
  ) {
    return invalid('参数不完整或超出范围，请回到输入页重新填写生辰。');
  }

  const gender = genderRaw;
  const svc = getService();

  let result: ReturnType<typeof svc.full>;
  try {
    result = svc.full({
      year,
      month,
      day,
      hour,
      gender,
      ...(name ? { name } : {}),
    });
  } catch (err) {
    return invalid(
      err instanceof Error ? err.message : '排盘失败，请检查出生日期是否合法。',
    );
  }

  const { chart, reading } = result;

  const center = {
    lunarYear: chart.lunar.lunarYear,
    lunarMonth: chart.lunar.lunarMonth,
    lunarDay: chart.lunar.lunarDay,
    isLeapMonth: chart.lunar.isLeapMonth,
    yearStem: chart.lunar.yearStem,
    yearBranch: chart.lunar.yearBranch,
    ...(chart.lunar.fourPillars ? { fourPillars: chart.lunar.fourPillars } : {}),
    ...(chart.lunar.fourPillarsLunar
      ? { fourPillarsLunar: chart.lunar.fourPillarsLunar }
      : {}),
    mingGongBranch: chart.mingGongBranch,
    shenGongBranch: chart.shenGongBranch,
    wuxingJu: chart.wuxingJu,
    wuxingJuName: chart.wuxingJuName,
    ziweiPos: chart.ziweiPos,
    ...(chart.mingZhu ? { mingZhu: chart.mingZhu } : {}),
    ...(chart.shenZhu ? { shenZhu: chart.shenZhu } : {}),
    ...(chart.yinYangGender ? { yinYangGender: chart.yinYangGender } : {}),
    currentAge: chart.currentAge,
  };

  const chartDate = formatDate(year, month, day);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      {/* 生辰摘要 */}
      <header className="mb-8 border-b border-line pb-6">
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">紫微斗数命盘</p>
        <h1 className="font-serif text-2xl font-semibold tracking-[0.1em] text-ink sm:text-3xl">
          {name ? `${name} · ` : ''}
          {year} 年 {month} 月 {day} 日 · {SHICHEN_NAMES[hour]}时 ·{' '}
          {GENDER_LABEL[gender]}
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          排盘日 <span className="tabular-nums">{chartDate}</span>
          {' · '}时辰序号 <span className="tabular-nums">{hour}</span>（
          {SHICHEN_NAMES[hour]}时 {SHICHEN_RANGES[hour]}）
          {' · '}未做真太阳时校正
        </p>
      </header>

      {/* 晚子时提示 */}
      {lateFlag && (
        <div className="mb-8 rounded-xl border border-zhu/25 bg-zhu-soft/50 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink-2">
            <span className="font-medium text-zhu">已按晚子时规则调整：</span>
            输入的出生日期 {birthDateRaw || '—'} 属晚子时（23:00–23:59），
            排盘日已顺延至 <span className="tabular-nums">{chartDate}</span>，
            时辰为 <span className="tabular-nums">{hour}</span>（{SHICHEN_NAMES[hour]}时）。
          </p>
        </div>
      )}

      {/* 命盘 */}
      <section aria-label="十二宫命盘" className="mb-14">
        <ChartBoard palaces={chart.palaces} center={center} />
      </section>

      {/* 解读 */}
      <section aria-label="十三维解读">
        {reading.status === 'ok' ? (
          <ReadingPanel
            dimensions={reading.dimensions.map((d) => ({
              key: d.key,
              label: d.label,
              text: d.text,
              chars: d.chars,
            }))}
            totalChars={reading.totalChars}
          />
        ) : (
          <NotCoveredNotice
            message={reading.message}
            availableYears={reading.availableYears}
            lookupKey={reading.key}
          />
        )}
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2 text-xs tracking-wide text-ink-2 transition-colors hover:border-ink-3"
        >
          重新排盘
        </Link>
        <Link
          href="/about"
          className="inline-flex items-center rounded-lg border border-line bg-surface px-4 py-2 text-xs tracking-wide text-ink-2 transition-colors hover:border-ink-3"
        >
          口径说明
        </Link>
      </div>
    </div>
  );
}
