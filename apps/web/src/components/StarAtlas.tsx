/**
 * 紫微垣星图（首页 hero）—— 仿古星图：墨线连星、三重环垣、廿八宿刻度。
 * 纯 SVG + CSS 动画（缓转 120s / 星点错峰呼吸），无 JS 动画，无依赖。
 * 动效 class 与 reduced-motion 兜底都在 globals.css「观星星图」段。
 */

/** 星官：一组折线连起来的星点（坐标为 400×400 viewBox，中心 200,200） */
const ASTERISMS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // 北斗（天枢→摇光）：勺身四星 + 勺柄三星，全站辨识度最高的星官
  [
    [120, 105],
    [150, 120],
    [175, 112],
    [190, 95],
    [215, 85],
    [240, 70],
    [262, 52],
  ],
  [
    [95, 280],
    [120, 295],
    [140, 278],
    [160, 300],
  ],
  [
    [285, 220],
    [305, 240],
    [290, 265],
    [310, 285],
  ],
  [
    [60, 190],
    [85, 200],
    [75, 225],
  ],
  [
    [280, 120],
    [300, 140],
    [320, 130],
  ],
  [
    [210, 320],
    [235, 330],
    [258, 318],
    [280, 332],
  ],
];

/** 散星（不属于任何星官的背景星） */
const LONE_STARS: ReadonlyArray<readonly [number, number, number]> = [
  // [x, y, r]
  [200, 60, 1.6],
  [110, 165, 1.4],
  [90, 120, 1.2],
  [245, 165, 1.5],
  [330, 195, 1.3],
  [255, 235, 1.2],
  [170, 240, 1.6],
  [130, 235, 1.2],
  [205, 265, 1.4],
  [150, 340, 1.3],
  [305, 305, 1.2],
  [65, 255, 1.4],
  [340, 90, 1.3],
  [230, 130, 1.2],
  [165, 175, 1.5],
];

/** 呼吸闪烁的星（错峰 delay，秒）—— 只挑几颗，多了就闹 */
const TWINKLE: ReadonlyArray<readonly [number, number, number, number]> = [
  // [x, y, r, delay]
  [190, 95, 2.4, 0], // 北斗勺身（天权）
  [262, 52, 2.4, 1.1], // 摇光
  [140, 278, 2, 1.8],
  [300, 140, 2, 2.5],
];

const INK = '#3D5A85'; // zhu 黛青：墨线
const GOLD = '#A8792F'; // star-miao 鎏金：主星点睛

/** 十二地支 —— 方位与命盘页 GRID_POS 一致（子在午顶、卯在左、酉在右）：
    branch+1 = 顺时针下一宫；角位自 10:30 起每 30° 一位 */
const BRANCHES: ReadonlyArray<readonly [number, string]> = [
  [0, '子'], [1, '丑'], [2, '寅'], [3, '卯'], [4, '辰'], [5, '巳'],
  [6, '午'], [7, '未'], [8, '申'], [9, '酉'], [10, '戌'], [11, '亥'],
];

/** 地支刻字位置：branch → [x, y]（r=168，自 12 点顺时针，每宫 30°） */
function branchPos(branch: number): readonly [number, number] {
  const i = (branch - 5 + 12) % 12; // i=0 → branch 5（巳，10:30 位）
  const theta = (-45 + i * 30) * (Math.PI / 180); // 顺时针，正角在 12 点
  const r = 168;
  return [200 + r * Math.sin(theta), 200 - r * Math.cos(theta)];
}

export default function StarAtlas({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {/* 静态层：环垣、刻度、十二地支、极星十字丝 —— 方位不能随星图转 */}
      <g>
        {/* 三重环垣 */}
        <circle cx="200" cy="200" r="188" fill="none" stroke={INK} strokeOpacity="0.28" strokeWidth="1" />
        <circle cx="200" cy="200" r="152" fill="none" stroke={INK} strokeOpacity="0.18" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="116" fill="none" stroke={INK} strokeOpacity="0.12" strokeWidth="0.8" />

        {/* 廿八宿刻度：外环 28 等分短线 */}
        {Array.from({ length: 28 }, (_, i) => {
          const a = (i * 360) / 28;
          return (
            <line
              key={i}
              x1="200" y1="14" x2="200" y2="22"
              stroke={INK} strokeOpacity="0.3" strokeWidth="0.8"
              transform={`rotate(${a} 200 200)`}
            />
          );
        })}

        {/* 十二地支刻字：与命盘页同一套方位（子在午顶、卯左酉右） */}
        {BRANCHES.map(([branch, glyph]) => {
          const [x, y] = branchPos(branch);
          return (
            <text
              key={branch}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fill={INK}
              fillOpacity="0.42"
              fontFamily='"Songti SC", "Noto Serif SC", serif'
            >
              {glyph}
            </text>
          );
        })}

        {/* 极星十字丝：古星图中心的定位标记 */}
        <g stroke={INK} strokeOpacity="0.22" strokeWidth="0.7">
          <line x1="186" y1="200" x2="214" y2="200" />
          <line x1="200" y1="186" x2="200" y2="214" />
        </g>
      </g>

      {/* 缓转层：星官与散星 120s 一圈 —— 慢到几乎察觉不到，只有星点在漂 */}
      <g className="star-atlas-rotor">
        {/* 星官连线 + 星点 */}
        {ASTERISMS.map((stars, i) => (
          <g key={i}>
            <polyline
              points={stars.map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke={INK}
              strokeOpacity="0.32"
              strokeWidth="0.7"
            />
            {stars.map(([x, y], j) => (
              <circle key={j} cx={x} cy={y} r="1.8" fill={INK} fillOpacity="0.75" />
            ))}
          </g>
        ))}

        {/* 散星 */}
        {LONE_STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={INK} fillOpacity="0.4" />
        ))}

        {/* 呼吸星：中心紫微鎏金，其余黛青 */}
        {TWINKLE.map(([x, y, r, delay], i) => (
          <circle
            key={i}
            className="star-twinkle"
            cx={x} cy={y} r={r}
            fill={i === 2 ? GOLD : INK}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </g>

      {/* 紫微：中宫正位，鎏金 + 光晕（静态，不随星图转） */}
      <g className="star-twinkle">
        <circle cx="200" cy="200" r="3" fill={GOLD} />
        <circle cx="200" cy="200" r="9" fill="none" stroke={GOLD} strokeOpacity="0.35" strokeWidth="0.8" />
      </g>
    </svg>
  );
}
