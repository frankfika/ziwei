import Link from 'next/link';
import ChartTabs from '@/components/ChartTabBar';
import { describeProviderEnv } from '@ziwei/ask';
import { liuNianLayer, daXianLayer, liuYueLayer } from '@ziwei/chart-engine';
import { getService } from '@/lib/service';
import { GENDER_LABEL, SHICHEN_NAMES, SHICHEN_RANGES, formatDate } from '@/lib/birth';
import {
  applyCitationModeToDimensions,
  resolveCitationMode,
  CITATION_MODE_LABEL,
} from '@/lib/citations';

export const dynamic = 'force-dynamic';

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function invalid(message: string) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg tracking-wide text-ink">无法排盘</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2" role="alert">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            回到输入页
          </Link>
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-5 py-2.5 text-sm text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            查看口径说明
          </Link>
        </div>
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

  const reportUrl = `/report?y=${year}&m=${month}&d=${day}&h=${hour}&g=${gender}${name ? `&n=${encodeURIComponent(name)}` : ''}`;

  const chartDate = formatDate(year, month, day);
  const readingOk = reading.status === 'ok';

  // 运限层：流年 5 年（前年~后年，可选），大限一层。引擎真实计算（宫名 + 四化落宫）
  const nowYear = new Date().getFullYear();
  const liunianYears = [-2, -1, 0, 1, 2].map((offset) => {
    const ly = liuNianLayer(chart, nowYear + offset);
    return {
      kind: 'liunian' as const,
      label: `${ly.ganzhi} ${ly.year}`,
      year: ly.year,
      mingBranch: ly.mingBranch,
      palaces: ly.palaces,
      siHua: ly.siHua,
      siHuaPalaces: ly.siHuaPalaces,
    };
  });
  const liunian = liunianYears[2]; // 今年，解读 tab 运势卡与追问上下文用它

  // 12 个流月层（当前农历年），时间轴流月层与月份切换的数据源
  const CN_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  const liuyueMonths = Array.from({ length: 12 }, (_, i) => {
    const ly = liuYueLayer(chart, new Date().getFullYear(), i + 1);
    return {
      kind: 'liunian' as const,
      label: CN_MONTH_NAMES[i],
      mingBranch: ly.mingBranch,
      palaces: ly.palaces,
      siHua: ly.siHua,
      siHuaPalaces: ly.siHuaPalaces,
    };
  });

  // 当前大限：取当前大限落宫的宫位序号
  const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
  const dxIndex = dxPalace
    ? chart.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch)
    : -1;
  const daXian = dxIndex >= 0 ? daXianLayer(chart, dxIndex) : null;
  const dx = dxIndex >= 0 ? chart.daXians[dxIndex] : undefined;
  const currentDaXian = dx
    ? {
        startAge: dx.startAge,
        endAge: dx.endAge,
        palaceName: dx.palaceName,
        ...(dx.stemName ? { stemName: dx.stemName } : {}),
        ...(dx.siHua
          ? { siHua: { lu: dx.siHua.lu, quan: dx.siHua.quan, ke: dx.siHua.ke, ji: dx.siHua.ji } }
          : {}),
      }
    : null;

  // 引文降级在服务端算好，客户端壳只收纯数据
  const citationMode = resolveCitationMode(process.env.ZIWEI_CITATION_MODE);
  const applied = readingOk
    ? applyCitationModeToDimensions(
        reading.dimensions.map((d) => ({
          key: d.key,
          label: d.label,
          text: d.text,
          chars: d.chars,
        })),
        citationMode,
      )
    : null;

  const provider = describeProviderEnv();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-2 sm:px-6 sm:py-4 md:py-0">
      <ChartTabs
        palaces={chart.palaces}
        center={center}
        liunian={liunian}
        liunianYears={liunianYears}
        daXian={daXian}
        liuyueMonths={liuyueMonths}
        reportUrl={reportUrl}
        currentDaXian={currentDaXian}
        reading={{
          ok: readingOk,
          dimensions: applied?.dimensions,
          totalChars: readingOk ? reading.totalChars : 0,
          citationNotice: applied
            ? {
                mode: citationMode,
                modeLabel: CITATION_MODE_LABEL[citationMode],
                totalCitations: applied.totalCitations,
                redactedDims: applied.redactedDims,
              }
            : undefined,
          notCovered: readingOk
            ? undefined
            : { message: reading.message, availableYears: reading.availableYears },
        }}
        ask={{
          year,
          month,
          day,
          hour,
          gender,
          available: readingOk,
          providerConfigured: provider.ok,
        }}
        share={{
          ...(name ? { name } : {}),
          year,
          month,
          day,
          hour,
          gender,
          chartDate,
        }}
        /* 摘要行：单行 H1（不再是大标题块） */
        summary={
          <h1 className="truncate text-sm font-medium tracking-wide text-ink md:text-base">
            {name ? `${name} · ` : ''}
            {`${year}年${month}月${day}日`} · {SHICHEN_NAMES[hour]}时 · {GENDER_LABEL[gender]}
            {lateFlag && (
              <span className="ml-1.5 text-zhu" title="晚子时已按传统规则顺延排盘日">
                晚子时顺延
              </span>
            )}
          </h1>
        }
        /* 「详情」折叠面板：口径说明默认藏起来，不占首屏高度 */
        details={
          <div className="space-y-2 text-2xs leading-relaxed text-ink-2">
            <p>
              排盘日 <span className="tabular-nums text-ink">{`${year}年${month}月${day}日`}</span>
            </p>
            <p>
              {SHICHEN_NAMES[hour]}时（{SHICHEN_RANGES[hour]}）
            </p>
            <p>未做真太阳时校正</p>
            {lateFlag && (
              <p className="text-zhu">
                晚子时已顺延：输入日期 {birthDateRaw || '—'} 属晚子时（23:00–23:59），
                排盘日顺延至 {chartDate}，时辰为 {SHICHEN_NAMES[hour]}时。
              </p>
            )}
            <div className="flex flex-wrap gap-3 border-t border-lineSoft pt-2">
              <Link
                href="/"
                className="text-ink underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                重新排盘
              </Link>
              <Link
                href="/about"
                className="text-ink underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                口径说明
              </Link>
            </div>
          </div>
        }
      />
    </div>
  );
}
