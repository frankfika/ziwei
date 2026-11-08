import ChartTabs from '@/components/ChartTabBar';
import { ChartDetails, ChartInvalid, ChartSummary } from '@/components/ChartPageChrome';
import { describeProviderEnv } from '@ziwei/ask';
import { liuNianLayer, daXianLayer, liuYueLayer } from '@ziwei/chart-engine';
import { getService } from '@/lib/service';
import { SHICHEN_NAMES, SHICHEN_RANGES, formatDate } from '@/lib/birth';
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
    return <ChartInvalid kind="params" />;
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
    return (
      <ChartInvalid
        kind="failed"
        {...(err instanceof Error ? { message: err.message } : {})}
      />
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
          <ChartSummary
            {...(name ? { name } : {})}
            year={year}
            month={month}
            day={day}
            shichen={SHICHEN_NAMES[hour]}
            gender={gender}
            lateZi={lateFlag}
          />
        }
        /* 「详情」折叠面板：口径说明默认藏起来，不占首屏高度 */
        details={
          <ChartDetails
            year={year}
            month={month}
            day={day}
            shichen={SHICHEN_NAMES[hour]}
            shichenRange={SHICHEN_RANGES[hour]}
            lateZi={lateFlag}
            birthDate={birthDateRaw}
            chartDate={chartDate}
          />
        }
      />
    </div>
  );
}
