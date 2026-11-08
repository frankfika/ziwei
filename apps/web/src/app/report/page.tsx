import { liuNianLayer, daXianLayer, liuYueLayer, type ChartJSON } from '@ziwei/chart-engine';
import { getService } from '@/lib/service';
import ReportView, { ReportInvalid, type ReportData } from '@/components/ReportView';
import { CN_MONTH_NAMES, SIHUA_LABELS, SIHUA_NAMES } from '@/lib/readingCopy';

export const dynamic = 'force-dynamic';
export const metadata = { title: '年度运势报告 · Annual Fortune Report' };

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

export default async function ReportPage({
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

  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || hour < 0 || hour > 11 ||
    (genderRaw !== 'male' && genderRaw !== 'female')
  ) {
    return <ReportInvalid kind="params" />;
  }
  const gender = genderRaw as 'male' | 'female';

  const svc = getService();
  let reading: ReturnType<typeof svc.reading>;
  let chart: ReturnType<typeof svc.chart>;
  try {
    const birth = { year, month, day, hour, gender, ...(name ? { name } : {}) };
    chart = svc.chart(birth);
    reading = svc.reading(birth);
  } catch (err) {
    return (
      <ReportInvalid
        kind="error"
        {...(err instanceof Error ? { message: err.message } : {})}
      />
    );
  }

  const nowYear = new Date().getFullYear();
  const ln = liuNianLayer(chart, nowYear);
  const lnMing = chart.palaces.find((p) => p.branch === ln.mingBranch);
  const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
  const dxIndex = dxPalace ? chart.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch) : -1;
  const dx = dxIndex >= 0 ? chart.daXians[dxIndex] : null;
  const dxLayer = dxIndex >= 0 ? daXianLayer(chart, dxIndex) : null;

  // 流年四化落宫 → 对应流年宫名
  const sihua = (['lu', 'quan', 'ke', 'ji'] as const).map((key) => {
    const name4 = SIHUA_NAMES[key];
    const starName = ln.siHua[key];
    const branch = (ln.siHuaPalaces as Record<string, number | undefined>)[name4];
    const natal = branch !== undefined ? chart.palaces.find((p) => p.branch === branch) : null;
    const liunianPalace = branch !== undefined ? ln.palaces.find((p) => p.branch === branch) : null;
    return {
      label: SIHUA_LABELS[key],
      star: starName,
      natalName: natal?.name ?? '',
      natalBranch: natal?.branchName ?? '',
      liunianPalace: liunianPalace?.name ?? null,
    };
  });

  // 流年十二宫落位
  const placements = ln.palaces.map((lp) => {
    const natal = chart.palaces.find((p) => p.branch === lp.branch);
    return {
      name: lp.name,
      natalName: natal?.name ?? '',
      natalBranch: natal?.branchName ?? '',
      stars: natal?.majorStars ?? [],
    };
  });

  // 命格总览（数据集原文节选）
  const overview = reading.status === 'ok' ? reading.dimensions.find((d) => d.key === 'overview') : null;

  // 各月流月命宫
  const liuyue = CN_MONTH_NAMES.map((label, i) => {
    const ly = liuYueSafe(chart, nowYear, i + 1);
    const natal = chart.palaces.find((p) => p.branch === ly?.mingBranch);
    // 宫名去掉「宫」字只留宫位名（数据原文，不翻）
    return { label, palace: natal?.name.replace('宫', '') ?? '—' };
  });

  const query = `y=${year}&m=${month}&d=${day}&h=${hour}&g=${gender}${
    name ? `&n=${encodeURIComponent(name)}` : ''
  }`;

  const data: ReportData = {
    name,
    birth: { year, month, day, hour, gender },
    nowYear,
    ganzhi: ln.ganzhi,
    liunianMing: lnMing
      ? { name: lnMing.name, branchName: lnMing.branchName, majorStars: lnMing.majorStars }
      : null,
    sihua,
    placements,
    daxian: dx
      ? {
          startAge: dx.startAge,
          endAge: dx.endAge,
          palaceName: dx.palaceName,
          stemName: dx.stemName ?? '',
          sihua: dx.siHua ?? null,
        }
      : null,
    daxianNote: !!dxLayer,
    overview: overview
      ? {
          text: stripMd(overview.text.length > 800 ? `${overview.text.slice(0, 800)}…` : overview.text),
          chars: overview.chars,
        }
      : null,
    liuyue,
    chartUrl: `/chart?${query}`,
    shareUrl: `/report?${query}`,
  };

  return <ReportView data={data} />;
}

/** 报告节选去掉 markdown 强调记号（节选不渲染富文本，直接显示原文会更干净） */
function stripMd(text: string): string {
  return text.replace(/\*\*/g, '');
}

function liuYueSafe(chart: ChartJSON, year: number, month: number) {
  try {
    return liuYueLayer(chart, year, month);
  } catch {
    return null;
  }
}
