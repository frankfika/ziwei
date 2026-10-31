import type { ChartPalace, ChartStar } from '@ziwei/chart-engine';

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

export const SIHUA_CLASS: Record<string, string> = {
  禄: 'text-hua-lu border-hua-lu/30 bg-hua-lu/10',
  权: 'text-hua-quan border-hua-quan/30 bg-hua-quan/10',
  科: 'text-hua-ke border-hua-ke/30 bg-hua-ke/10',
  忌: 'text-hua-ji border-hua-ji/30 bg-hua-ji/10',
};

/** 庙旺利得平不陷 → 文字层次（移动端紧凑宫格也复用） */
export function brightnessClass(b?: string): string {
  switch (b) {
    case '庙':
    case '旺':
      return 'text-[#8a5512]';
    case '得':
    case '利':
      return 'text-ink';
    case '平':
      return 'text-ink-2';
    case '不':
    case '陷':
      return 'text-ink-3';
    default:
      return 'text-ink';
  }
}

function SiHuaBadge({ siHua }: { siHua: string }) {
  return (
    <span
      className={`chip ${SIHUA_CLASS[siHua] ?? 'border-line bg-paper text-ink-2'}`}
      title={`四化：${siHua}`}
    >
      {siHua}
    </span>
  );
}

function StarName({
  star,
  size = 'md',
  selfSihua,
}: {
  star: ChartStar;
  size?: 'md' | 'sm';
  selfSihua?: string;
}) {
  const base =
    size === 'md'
      ? 'text-[15px] font-semibold tracking-tight'
      : 'text-[11px] leading-tight';
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`${base} ${brightnessClass(star.brightnessRaw)}`}>
        {star.name}
      </span>
      {star.brightnessRaw && size === 'md' && (
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
}

export default function PalaceCell({
  palace,
  selected,
  inSanFang,
  onSelect,
}: PalaceCellProps) {
  const selfSihuaMap = new Map<string, string>();
  for (const s of palace.selfSihua ?? []) {
    selfSihuaMap.set(s.starName, s.siHua);
  }

  const major = palace.stars.filter((s) => s.type === 'major');
  const minor = palace.stars.filter((s) => s.type === 'minor');
  const lucky = palace.stars.filter((s) => s.type === 'lucky');
  const sha = palace.stars.filter((s) => s.type === 'sha');

  const highlight = selected
    ? 'bg-zhu-soft/60 ring-1 ring-inset ring-zhu/40'
    : inSanFang
      ? 'bg-zhu-soft/25 ring-1 ring-inset ring-zhu/15'
      : 'bg-surface';

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
      className={`group relative flex h-full w-full break-inside-avoid flex-col items-start gap-1.5 p-3 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zhu ${highlight}`}
    >
      {/* 宫名 · 干支 · 大限 */}
      <div className="flex w-full items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
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
          <span className="text-[13px] text-ink-2">空宫</span>
        ) : (
          major.map((star) => (
            <div key={star.name} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <StarName star={star} selfSihua={selfSihuaMap.get(star.name)} />
            </div>
          ))
        )}
      </div>

      {/* 辅星 / 杂曜 / 煞星 */}
      {minor.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {minor.map((star) => (
            <StarName key={star.name} star={star} size="sm" />
          ))}
        </div>
      )}
      {lucky.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {lucky.map((star) => (
            <StarName key={star.name} star={star} size="sm" />
          ))}
        </div>
      )}
      {sha.length > 0 && (
        <div className="flex w-full flex-wrap gap-x-1.5 gap-y-0.5">
          {sha.map((star) => (
            <span
              key={star.name}
              className="inline-flex items-baseline gap-1 text-[11px] leading-tight text-ink-3"
            >
              {star.name}
              {star.siHua && <SiHuaBadge siHua={star.siHua} />}
            </span>
          ))}
        </div>
      )}

      {/* 标记：命宫 / 身宫 / 空宫借宫 */}
      <div className="mt-auto flex w-full flex-wrap items-center gap-1 pt-1">
        {palace.isMingGong && (
          <span className="chip border-zhu/40 bg-zhu-soft text-zhu">命宫</span>
        )}
        {palace.isShenGong && (
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
