import Link from 'next/link';
import type { ChartFortuneLayer, ChartPalace } from '@ziwei/chart-engine';
import { SHICHEN_NAMES, STEM_NAMES } from '@/lib/birth';

/** 盘面时间层：本命 / 大限 / 流年 / 流月（叠加视图） */
export type BoardLayer = 'natal' | 'daxian' | 'liunian' | 'liuyue';

/** 当前大限摘要（chart.daXians[currentDaXianIndex] 的展示子集） */
export interface CurrentDaXianInfo {
  startAge: number;
  endAge: number;
  palaceName: string;
  stemName?: string;
  siHua?: { lu: string; quan: string; ke: string; ji: string };
}

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
  chips = [],
  onJumpBranch,
  onNavigateTab,
  layer = 'natal',
  onLayerChange,
  fortune = null,
  currentDaXian = null,
  onAskTime,
  liuyueMonth,
  onLiuyueMonthChange,
  liuyueLabels,
  liunianIdx,
  onLiunianIdxChange,
  liunianLabels,
  reportUrl,
  compact = false,
}: {
  palaces: ChartPalace[];
  info: ChartCenterInfo;
  /** 跳转芯片：命宫 / 身宫 / 当前大限（中宫即控制区） */
  chips?: Array<{ key: string; label: string; branch: number; active: boolean }>;
  onJumpBranch?: (branch: number) => void;
  /** 跳到底部 tab：解读 / 追问 */
  onNavigateTab?: (tab: 'reading' | 'ask') => void;
  /** 时间轴叠加层 */
  layer?: BoardLayer;
  onLayerChange?: (layer: BoardLayer) => void;
  /** 运限层：流年或大限（含该层十二宫名与四化落宫） */
  fortune?: ChartFortuneLayer | null;
  currentDaXian?: CurrentDaXianInfo | null;
  /** 「就这步运追问」 */
  onAskTime?: (time: 'liunian' | 'daxian') => void;
  /** 流月：当前选中月（1–12）与切换回调、12 个月名 */
  liuyueMonth?: number;
  onLiuyueMonthChange?: (month: number) => void;
  liuyueLabels?: string[];
  /** 流年 5 年：选中下标与切换回调、年份标签 */
  liunianIdx?: number;
  onLiunianIdxChange?: (idx: number) => void;
  liunianLabels?: string[];
  /** 年度报告页链接（含本盘参数） */
  reportUrl?: string;
  /** 紧凑版：移动端中宫只留局名/命主/虚岁 + 时间轴，省掉生辰/四柱/落宫 */
  compact?: boolean;
}) {
  const branchOf = (b: number) =>
    palaces.find((p) => p.branch === b)?.branchName ?? SHICHEN_NAMES[b] ?? '—';

  const pillars = info.fourPillars;

  return (
    // 中宫比宫卡更深一档（paper）—— 造成「洞 / 虚空」的层次
    <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 bg-paper px-4 py-3">
      {/* 中宫主视觉：局名 display 居中 → 命主/身主一行 → 虚岁一行（§B4） */}
      <div className="text-center">
        <p className="font-serif text-title font-semibold text-ink">{info.wuxingJuName}</p>
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

      {/* 时间轴：本命 / 大限 / 流年 叠加切换 */}
      {onLayerChange && (
        <div
          role="tablist"
          aria-label="时间层"
          className="flex rounded-full border border-line bg-surface p-0.5"
        >
          {(
            [
              ['natal', '本命'],
              ['daxian', '大限'],
              ['liunian', '流年'],
              ['liuyue', '流月'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={layer === key}
              onClick={() => onLayerChange(key)}
              className={`rounded-full px-3 py-1.5 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                layer === key ? 'bg-zhu-soft text-ink' : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 运限事实：切到大限/流年时，中宫给出这一层的摘要（引擎真实计算） */}
      {layer !== 'natal' && fortune && (
        <div className="w-full space-y-0.5 rounded-lg border border-hua-ke/30 bg-surface px-2.5 py-2 text-left">
          <p className="text-2xs text-ink-3">
            {fortune.kind === 'liunian' ? '流年' : '当前大限'}{' '}
            <span className="text-ink">{fortune.label}</span> ·{' '}
            {fortune.kind === 'liunian' ? '命宫在' : '命宫在'}
            {palaces.find((p) => p.branch === fortune.mingBranch)?.name ?? ''}
          </p>
          <p className="text-2xs leading-snug text-ink-2">
            四化：禄 {fortune.siHua.lu} · 权 {fortune.siHua.quan} · 科 {fortune.siHua.ke} · 忌{' '}
            {fortune.siHua.ji}
          </p>
          {onAskTime && (
            <button
              type="button"
              onClick={() => onAskTime(fortune.kind)}
              className="mt-0.5 inline-flex min-h-8 items-center rounded-full border border-zhu/30 px-2.5 py-1 text-2xs leading-none text-zhu transition-colors hover:bg-zhu-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              {fortune.kind === 'liunian' ? '就今年追问' : '就这步大限追问'}
            </button>
          )}
        </div>
      )}

      {/* 流年年份选择：只在流年层显示（前年~后年，替换本命跳转芯片行） */}
      {layer === 'liunian' && onLiunianIdxChange && (liunianLabels?.length ?? 0) > 0 && (
        <div
          role="radiogroup"
          aria-label="流年年份"
          className="flex max-w-full flex-wrap items-center justify-center gap-1"
        >
          {liunianLabels!.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={liunianIdx === i}
              onClick={() => onLiunianIdxChange(i)}
              className={`rounded-full border px-1.5 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                liunianIdx === i
                  ? 'border-zhu bg-zhu-soft text-ink'
                  : 'border-line bg-surface text-ink-3 hover:text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 流月月份选择：只在流月层显示（替换本命跳转芯片，高度不涨） */}
      {layer === 'liuyue' && onLiuyueMonthChange && liuyueLabels?.length === 12 && (
        <div
          role="radiogroup"
          aria-label="流月月份"
          className="flex max-w-full flex-wrap items-center justify-center gap-1"
        >
          {liuyueLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={liuyueMonth === i + 1}
              onClick={() => onLiuyueMonthChange(i + 1)}
              className={`rounded-full border px-1.5 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                liuyueMonth === i + 1
                  ? 'border-zhu bg-zhu-soft text-ink'
                  : 'border-line bg-surface text-ink-3 hover:text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 控制区：跳转芯片 + 解读/追问入口（中宫负责操作）；流年/流月层时隐藏，给选择 chips 让位 */}
      {(layer === 'natal' || layer === 'daxian') && (chips.length > 0 || onNavigateTab) && (
        <div className="flex w-full flex-col items-center gap-2">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => onJumpBranch?.(chip.branch)}
                  aria-pressed={chip.active}
                  className={`rounded-full border px-2 py-1 text-2xs leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu ${
                    chip.active
                      ? 'border-zhu bg-zhu-soft text-ink'
                      : 'border-line bg-surface text-ink-2 hover:border-ink-3'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          {onNavigateTab && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigateTab('reading')}
                className="rounded-full border border-line bg-surface px-2 py-1 text-2xs shrink-0 whitespace-nowrap leading-none text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                看解读
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('ask')}
                className="rounded-full border border-line bg-surface px-2 py-1 text-2xs shrink-0 whitespace-nowrap leading-none text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
              >
                去追问
              </button>
              {reportUrl && (
                <Link
                  href={reportUrl}
                  className="rounded-full border border-line bg-surface px-2 py-1 text-2xs shrink-0 whitespace-nowrap leading-none text-ink-2 transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
                >
                  年报
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* 专业层：四柱 / 落宫 / 生辰 —— 默认折叠，中宫不再被撑高 */}
      {!compact && (
        <details className="group w-full">
          <summary className="cursor-pointer list-none text-center text-2xs text-ink-3 transition-colors hover:text-ink-2 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              专业层 · 四柱与落宫
              <span aria-hidden="true" className="transition-transform group-open:rotate-180">
                ▾
              </span>
            </span>
          </summary>
          <div className="mt-2 space-y-3">
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
              <Row label="紫微">在{branchOf(info.ziweiPos)}宫</Row>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
