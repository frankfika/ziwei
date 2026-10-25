import type { ChartPalace } from '@ziwei/chart-engine';
import { SHICHEN_NAMES, STEM_NAMES } from '@/lib/birth';

/** 中宫展示所需的标量信息 */
export interface ChartCenterInfo {
  lunarYear: number;
  lunarMonth: number;
  lunarDay: number;
  isLeapMonth: boolean;
  yearStem: number;
  yearBranch: number;
  fourPillars?: [string, string, string, string];
  fourPillarsLunar?: [string, string, string, string];
  mingGongBranch: number;
  shenGongBranch: number;
  wuxingJu: number;
  wuxingJuName: string;
  ziweiPos: number;
  mingZhu?: string;
  shenZhu?: string;
  yinYangGender?: string;
  currentAge: number;
}

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_MONTHS = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];

function cnDay(day: number): string {
  if (day <= 10) return `初${CN_DIGITS[day]}`;
  if (day < 20) return `十${CN_DIGITS[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${CN_DIGITS[day - 20]}`;
  if (day === 30) return '三十';
  return `${CN_DIGITS[Math.floor(day / 10)]}十${CN_DIGITS[day % 10]}`;
}

function Row({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-2xs tracking-wide2 text-ink-3">{label}</span>
      <span
        className={`text-right text-xs tabular-nums ${accent ? 'text-zhu' : 'text-ink'}`}
      >
        {children}
      </span>
    </div>
  );
}

export default function CenterPanel({
  palaces,
  info,
}: {
  palaces: ChartPalace[];
  info: ChartCenterInfo;
}) {
  const branchOf = (b: number) =>
    palaces.find((p) => p.branch === b)?.branchName ?? SHICHEN_NAMES[b] ?? '—';

  const pillars = info.fourPillars;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-5 py-4">
      <div className="text-center">
        <p className="font-serif text-sm tracking-[0.3em] text-ink-2">紫微斗数</p>
        <p className="mt-1 text-2xs tracking-wide text-ink-3">
          {STEM_NAMES[info.yearStem]}
          {SHICHEN_NAMES[info.yearBranch]}年
          {info.isLeapMonth ? '闰' : ''}
          {CN_MONTHS[info.lunarMonth - 1]}月{cnDay(info.lunarDay)}
        </p>
      </div>

      {pillars && (
        <div className="w-full">
          <p className="mb-1.5 text-center text-2xs tracking-wide2 text-ink-3">四柱</p>
          <div className="grid grid-cols-4 gap-1">
            {pillars.map((p, i) => (
              <div
                key={`${p}-${i}`}
                className="rounded-md border border-lineSoft bg-paper py-1 text-center font-mono text-xs text-ink"
              >
                {p}
              </div>
            ))}
          </div>
          <p className="mt-1 text-center text-2xs text-ink-3">
            年 · 月 · 日 · 时
          </p>
        </div>
      )}

      <div className="w-full space-y-1.5">
        <Row label="命宫" accent>
          {branchOf(info.mingGongBranch)}宫
        </Row>
        <Row label="身宫">{branchOf(info.shenGongBranch)}宫</Row>
        <Row label="五行局" accent>
          {info.wuxingJuName}
        </Row>
        <Row label="命主">{info.mingZhu ?? '—'}</Row>
        <Row label="身主">{info.shenZhu ?? '—'}</Row>
        <Row label="紫微">
          在{branchOf(info.ziweiPos)}宫
        </Row>
        {info.yinYangGender && <Row label="阴阳男女">{info.yinYangGender}</Row>}
        <Row label="虚岁">{info.currentAge} 岁</Row>
      </div>
    </div>
  );
}
