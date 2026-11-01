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

/** 四柱列名（一行四个等宽的字，无边框格子墙） */
const PILLAR_LABELS = ['年', '月', '日', '时'];

function cnDay(day: number): string {
  if (day <= 10) return `初${CN_DIGITS[day]}`;
  if (day < 20) return `十${CN_DIGITS[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${CN_DIGITS[day - 20]}`;
  if (day === 30) return '三十';
  return `${CN_DIGITS[Math.floor(day / 10)]}十${CN_DIGITS[day % 10]}`;
}

/** 一行「标签 · 值」：标签最弱，值为正文级 */
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
      <span className="shrink-0 text-2xs text-ink-3">{label}</span>
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
    // 中宫比宫卡更深一档（paper）—— 造成「洞 / 虚空」的层次
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-paper px-4 py-4">
      {/* 中宫主视觉：局名 display 居中 → 命主/身主一行 → 虚岁一行（§B4） */}
      <div className="text-center">
        <p className="font-serif text-display text-ink">{info.wuxingJuName}</p>
        {(info.mingZhu || info.shenZhu) && (
          <p className="mt-1.5 text-xs text-ink-2">
            {info.mingZhu ? `命主 ${info.mingZhu}` : ''}
            {info.mingZhu && info.shenZhu ? ' · ' : ''}
            {info.shenZhu ? `身主 ${info.shenZhu}` : ''}
          </p>
        )}
        <p className="mt-1 text-2xs text-ink-3">
          {info.yinYangGender ? `${info.yinYangGender} · ` : ''}
          {info.currentAge > 0 && info.currentAge < 150 ? `虚岁 ${info.currentAge} 岁` : ''}
        </p>
      </div>

      {/* 细节退后：生辰、落宫 */}
      <div className="text-center">
        <p className="font-serif text-sm tracking-[0.3em] text-ink-2">紫微斗数</p>
        <p className="mt-1 text-2xs text-ink-3">
          {STEM_NAMES[info.yearStem]}
          {SHICHEN_NAMES[info.yearBranch]}年
          {info.isLeapMonth ? '闰' : ''}
          {CN_MONTHS[info.lunarMonth - 1]}月{cnDay(info.lunarDay)}
        </p>
      </div>

      {pillars && (
        <div className="w-full">
          <p className="mb-1.5 text-center text-2xs text-ink-3">四柱</p>
          {/* 一行四个等宽的字 + 下面一行干支：无边框、无格子墙 */}
          <div className="grid grid-cols-4 gap-x-2 gap-y-1">
            {PILLAR_LABELS.map((label) => (
              <span key={label} className="text-center text-2xs text-ink-3">
                {label}
              </span>
            ))}
            {pillars.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="text-center font-mono text-xs text-ink"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 细节退后：只留「落宫」这类不重复的信息 */}
      <div className="w-full space-y-2">
        <Row label="命宫" accent>
          {branchOf(info.mingGongBranch)}宫
        </Row>
        <Row label="身宫">{branchOf(info.shenGongBranch)}宫</Row>
        <Row label="紫微">
          在{branchOf(info.ziweiPos)}宫
        </Row>
      </div>
    </div>
  );
}
