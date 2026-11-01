import type { ChartFortuneLayer, ChartPalace, ChartStar } from '@ziwei/chart-engine';

/** 某星在该运限层的四化标记（禄/权/科/忌，无则 null） */
export function fortuneSiHuaOf(
  starName: string,
  layer: ChartFortuneLayer | null | undefined,
): string | null {
  if (!layer) return null;
  if (layer.siHua.lu === starName) return '禄';
  if (layer.siHua.quan === starName) return '权';
  if (layer.siHua.ke === starName) return '科';
  if (layer.siHua.ji === starName) return '忌';
  return null;
}

/** 地支索引 → 盘面网格坐标（1-based）：四四方阵 + 中宫 */
export const GRID_POS: Record<number, [number, number]> = {
  5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4],
  4: [2, 1], 9: [2, 4],
  3: [3, 1], 10: [3, 4],
  2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4],
};

/** 三方四正：本宫 + 对宫 + 两个三合宫 */
export function sanFangBranches(branch: number): number[] {
  return [branch, (branch + 6) % 12, (branch + 4) % 12, (branch + 8) % 12];
}

/** 四化：字色 + 低彩描边 + 8~10% 底（§B1，降到低彩度） */
export const SIHUA_CLASS: Record<string, string> = {
  禄: 'text-hua-lu border-hua-lu/40 bg-hua-lu/10',
  权: 'text-hua-quan border-hua-quan/40 bg-hua-quan/10',
  科: 'text-hua-ke border-hua-ke/40 bg-hua-ke/10',
  忌: 'text-hua-ji border-hua-ji/40 bg-hua-ji/10',
};

/** 庙旺利得平不陷 → 文字层次（仅主星可用；庙旺棕已废除，改 star.miao） */
export function brightnessClass(b?: string): string {
  switch (b) {
    case '庙':
    case '旺':
      return 'text-star-miao';
    case '得':
    case '利':
      return 'text-ink';
    case '平':
      return 'text-ink-2';
    case '不':
    case '陷':
      return 'text-star-xian';
    default:
      return 'text-ink';
  }
}

/** 星等三级（§B2）：主星 / 辅星吉星 / 煞星杂曜 */
type StarTier = 'major' | 'minor' | 'misc';

const TIER_CLASS: Record<StarTier, string> = {
  major: 'text-star-major font-semibold',
  minor: 'text-star-minor text-ink-2',
  misc: 'text-star-misc text-ink-3',
};

function SiHuaBadge({ siHua }: { siHua: string }) {
  return (
    <span
      className={`chip-sihua ${SIHUA_CLASS[siHua] ?? 'border-line bg-paper text-ink-2'}`}
      title={`四化：${siHua}`}
    >
      {siHua}
    </span>
  );
}

function StarName({
  star,
  tier = 'major',
  selfSihua,
}: {
  star: ChartStar;
  tier?: StarTier;
  selfSihua?: string;
}) {
  const isMajor = tier === 'major';
  return (
    <span className="inline-flex items-baseline gap-1">
      {/* 只有主星允许庙旺色，辅星煞曜永远不跟主星抢色 */}
      <span className={`${TIER_CLASS[tier]} ${isMajor ? brightnessClass(star.brightnessRaw) : ''}`}>
        {star.name}
      </span>
      {isMajor && star.brightnessRaw && (
        <span className="text-2xs text-ink-3">{star.brightnessRaw}</span>
      )}
      {star.siHua && <SiHuaBadge siHua={star.siHua} />}
      {selfSihua && (
        <span className="text-2xs text-ink-3" title={`宫干自化${selfSihua}`}>
          自化{selfSihua}
        </span>
      )}
    </span>
  );
}

interface PalaceCellProps {
  palace: ChartPalace;
  selected: boolean;
  inSanFang: boolean;
  onSelect: (branch: number) => void;
  /** 'board' = 盘面宫格 */
  variant?: 'board';
  /** 运限叠加层：该层宫名 + 该层四化落宫标记 */
  fortune?: ChartFortuneLayer | null;
  layerMark?: string;
}

export default function PalaceCell({
  palace,
  selected,
  inSanFang,
  onSelect,
  variant = 'board',
  fortune = null,
  layerMark = '',
}: PalaceCellProps) {
  const selfSihuaMap = new Map<string, string>();
  for (const s of palace.selfSihua ?? []) {
    selfSihuaMap.set(s.starName, s.siHua);
  }

  const major = palace.stars.filter((s) => s.type === 'major');
  const minor = palace.stars.filter((s) => s.type === 'minor');
  const lucky = palace.stars.filter((s) => s.type === 'lucky');
  const sha = palace.stars.filter((s) => s.type === 'sha');

  // 宫卡材质由 globals.css 的 .palace-cell / .is-selected / .is-sanfang 承担；
  // 动效 class 也在这里挂：选中 → 恒星呼吸（.palace-breathe），进入三方态 → 三方淡入（.sanfang-fade）。
  // .sanfang-fade 只在「刚变成三方」时加（class 增删才会重播 keyframes），常驻的 is-sanfang 不触发动画。
  const stateClass = selected
    ? 'is-selected palace-breathe'
    : inSanFang
      ? 'is-sanfang sanfang-fade'
      : '';

  // 运限层的宫名（流年/大限落在本宫的那个宫）
  const fortuneName = fortune?.palaces.find((p) => p.branch === palace.branch)?.name ?? null;

  const majorSummary = major.map((s) => s.name).join('、') || '空宫';
  const ariaLabel = [
    palace.name,
    `主星${majorSummary}`,
    palace.isMingGong ? '命宫' : null,
    palace.isShenGong ? '身宫' : null,
    selected ? '已选中' : null,
    inSanFang ? '三方四正关联' : null,
  ]
    .filter(Boolean)
    .join('，');

  return (
    <button
      type="button"
      onClick={() => onSelect(palace.branch)}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={`palace-cell group relative flex h-full w-full break-inside-avoid flex-col items-start gap-1 p-2 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu ${stateClass} ${layerMark}`}
    >
      {/* 宫名 · 干支 · 大限 */}
      <div className="flex w-full items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span
            className={`text-xs font-medium tracking-wide ${
              palace.isMingGong
                ? 'text-zhu'
                : palace.isShenGong
                  ? 'text-hua-quan'
                  : 'text-ink-2'
            }`}
          >
            {palace.name}
          </span>
          {/* 运限层宫名：本命宫在流年/大限里叫什么，直接标出来 */}
          {fortuneName && fortuneName !== palace.name && (
            <span
              className="rounded-sm border border-hua-ke/40 bg-hua-ke/10 px-1 text-2xs leading-none text-hua-ke"
              title={`${fortune?.kind === 'liunian' ? '流年' : '大限'}${fortuneName}`}
            >
              {fortuneName.replace('宫', '')}
            </span>
          )}
          <span className="font-mono text-2xs text-ink-2">
            {palace.stemName}
            {palace.branchName}
          </span>
        </div>
        {palace.daXianAge && (
          <span
            className={`font-mono text-2xs tabular-nums ${
              palace.isCurrentDaXian ? 'text-zhu' : 'text-ink-3'
            }`}
            title={palace.isCurrentDaXian ? '当前大限' : '大限'}
          >
            {palace.daXianAge[0]}–{palace.daXianAge[1]}
          </span>
        )}
      </div>

      {/* 主星 */}
      <div className="flex w-full flex-col gap-0.5">
        {major.length === 0 ? (
          <span className="text-star-major text-ink-2">空宫</span>
        ) : (
          major.map((star) => {
            const lnMark = fortuneSiHuaOf(star.name, fortune);
            return (
            <div key={star.name} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <StarName star={star} tier="major" selfSihua={selfSihuaMap.get(star.name)} />
              {lnMark && (
                <span
                  className={`chip-sihua px-1 ${SIHUA_CLASS[lnMark] ?? 'border-line text-ink-3'}`}
                  title={`${fortune?.kind === 'liunian' ? '流年' : '大限'}四化：${lnMark}`}
                >
                  {fortune?.kind === 'liunian' ? '流' : '限'}
                  {lnMark}
                </span>
              )}
            </div>
            );
          })
        )}
      </div>

      {/* 辅星 / 吉星 */}
      {minor.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {minor.map((star) => (
            <StarName key={star.name} star={star} tier="minor" />
          ))}
        </div>
      )}
      {lucky.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {lucky.map((star) => (
            <StarName key={star.name} star={star} tier="minor" />
          ))}
        </div>
      )}
      {/* 煞星 / 杂曜 */}
      {sha.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {sha.map((star) => (
            <StarName key={star.name} star={star} tier="misc" />
          ))}
        </div>
      )}

      {/* 标记：命宫 / 身宫 / 空宫借宫 */}
      <div className="mt-auto flex w-full flex-wrap items-center gap-1 pt-1">
        {variant === 'board' && palace.isMingGong && (
          <span className="chip border-zhu/30 bg-zhu-soft/40 text-zhu">命宫</span>
        )}
        {variant === 'board' && palace.isShenGong && (
          <span className="chip border-hua-quan/40 bg-hua-quan/10 text-hua-quan">身宫</span>
        )}
        {palace.isEmpty && (
          <span
            className="chip border-line bg-paper text-ink-3"
            title={
              palace.borrowedStars?.length
                ? `借${palace.borrowedFromName}：${palace.borrowedStars.join('、')}`
                : undefined
            }
          >
            空宫
            {palace.borrowedFromName ? ` · 借${palace.borrowedFromName}` : ''}
          </span>
        )}
        {palace.borrowedStars && palace.borrowedStars.length > 0 && (
          <span className="text-2xs text-ink-3">
            {palace.borrowedStars.join('、')}
          </span>
        )}
      </div>
    </button>
  );
}
