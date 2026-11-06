/**
 * 十二宫盘面布局 —— **纯函数，无任何运行时依赖**。
 *
 * 为什么单独抽出来：
 *  · 盘面排布是「算错就全错」的地方，必须能被单测钉死；
 *  · .ink 模板里写不了逻辑，所有几何都在这里算，模板只负责渲染。
 *
 * 排布约定与 Web 端完全一致（apps/web/src/components/PalaceCell.tsx 的 GRID_POS），
 * 改成 0-based，网格是经典四四方阵 + 中宫：
 *
 *        巳(5) 午(6) 未(7) 申(8)
 *        辰(4)  ┌───┐   酉(9)
 *        卯(3)  │中宫│   戌(10)
 *        寅(2)  └───┘   亥(11)
 *        ← 丑(1) 子(0) →
 *
 * 屏幕是 Rokid AI Glasses 的单色绿 HUD：**480 × 352 px**，
 * 所以 4 列每列 120 px，4 行每行 88 px，中宫 240 × 176 px。
 */

/** 地支索引 → 中文（0–11） */
export const BRANCH_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 地支索引 → 盘面网格坐标 [row, col]（0-based，4×4，中宫空缺） */
export const GRID_POS = {
  5: [0, 0], 6: [0, 1], 7: [0, 2], 8: [0, 3],
  4: [1, 0], 9: [1, 3],
  3: [2, 0], 10: [2, 3],
  2: [3, 0], 1: [3, 1], 0: [3, 2], 11: [3, 3],
};

/** 屏幕尺寸（Rokid AI Glasses 单色绿 HUD） */
export const SCREEN = { width: 480, height: 352, columns: 4, rows: 4 };

/** 单元格尺寸（按屏宽均分） */
export const CELL = {
  width: SCREEN.width / SCREEN.columns,
  height: SCREEN.height / SCREEN.rows,
};

/** 单色绿显示规范（Rokid Green） */
export const PALETTE = {
  background: '#000000',
  primary: '#00ff66',
  secondary: '#4da86c',
  muted: '#174526',
};

/** 四化标记的字面量（引擎里 siHua 字段就是这个值） */
export const SIHUA_MARKS = ['禄', '权', '科', '忌'];

/**
 * 十二宫 → 13 维解读里的对应维度。
 *
 * 这是产品上很关键的一处咬合：**点哪个宫，就读哪一维**。
 * 用户不需要在 13 个标签里找，看宫就知道看什么。
 * 「性格」是全局维度，没有对应宫位，单独从总览里出。
 */
export const DIMENSION_BY_PALACE = {
  命宫: 'overview',
  兄弟宫: 'family',
  夫妻宫: 'love',
  子女宫: 'children',
  财帛宫: 'wealth',
  疾厄宫: 'health',
  迁移宫: 'move',
  交友宫: 'friends',
  官禄宫: 'career',
  田宅宫: 'home',
  福德宫: 'spirit',
  父母宫: 'parents',
};

/** 13 维中文名（与引擎 DIMENSION_LABELS 保持一致） */
export const DIMENSION_LABELS = {
  overview: '命格总览',
  personality: '性格',
  love: '感情',
  career: '事业',
  wealth: '财运',
  health: '健康',
  family: '兄弟',
  children: '子女',
  move: '迁移',
  friends: '人际',
  home: '田宅',
  spirit: '福德',
  parents: '父母',
};

/**
 * 宫名 → 解读维度 key。
 *
 * @param {string} palaceName
 * @returns {string | null}
 */
export function dimensionOfPalace(palaceName) {
  return DIMENSION_BY_PALACE[palaceName] || null;
}

/**
 * 一个宫格的展示模型。
 *
 * @typedef {Object} PalaceCell
 * @property {number} branch 地支索引 0–11
 * @property {string} branchName 地支名
 * @property {string} stemName 天干名
 * @property {string} name 宫名（如「命宫」）
 * @property {boolean} isMingGong 是否命宫
 * @property {boolean} isShenGong 是否身宫
 * @property {boolean} isEmpty 是否空宫
 * @property {string} majorText 主星展示文本（含四化标记）
 * @property {string} minorText 辅星展示文本
 * @property {number} majorCount 主星总数（用于「+N」提示）
 * @property {number} row 网格行 0–3
 * @property {number} col 网格列 0–3
 */

/**
 * 把一颗星渲染成「星名(标记)」的形式。
 *
 * @param {{ name: string, siHua?: string }} star 星
 * @returns {string}
 */
export function formatStar(star) {
  if (!star || !star.name) return '';
  const mark = SIHUA_MARKS.includes(star.siHua) ? star.siHua : '';
  return mark ? `${star.name}(${mark})` : star.name;
}

/**
 * 生成一个宫格的展示模型。
 *
 * 主星最多显示 3 颗（超出显示「+N」），辅星最多显示 2 颗 —— 480×352 的 HUD 上
 * 塞更多字就糊了，宁可少给也不给看不清。
 *
 * @param {Object} palace ChartPalace
 * @returns {PalaceCell}
 */
export function buildCell(palace) {
  const pos = GRID_POS[palace.branch] || [0, 0];
  const major = (palace.stars || []).filter((s) => s.type === 'major');
  const minor = (palace.stars || []).filter((s) => s.type === 'minor');

  const majorShown = major.slice(0, 3).map(formatStar).filter(Boolean);
  const minorShown = minor.slice(0, 2).map((s) => s.name).filter(Boolean);

  const majorText = majorShown.join(' ');
  const overflow = major.length - majorShown.length;

  return {
    branch: palace.branch,
    branchName: palace.branchName || BRANCH_NAMES[palace.branch] || '',
    stemName: palace.stemName || '',
    name: palace.name || '',
    isMingGong: Boolean(palace.isMingGong),
    isShenGong: Boolean(palace.isShenGong),
    isEmpty: Boolean(palace.isEmpty),
    majorText: overflow > 0 ? `${majorText} +${overflow}` : majorText,
    minorText: minorShown.join(' '),
    majorCount: major.length,
    row: pos[0],
    col: pos[1],
  };
}

/**
 * 把整张 ChartJSON 变成 12 个宫格 + 1 份中宫信息。
 *
 * @param {Object} chart ChartJSON
 * @returns {{ cells: PalaceCell[], center: Object }}
 */
export function buildBoard(chart) {
  const palaces = (chart && chart.palaces) || [];
  const cells = palaces
    .map(buildCell)
    .sort((a, b) => a.branch - b.branch);

  const lunar = (chart && chart.lunar) || {};
  const pillars = lunar.fourPillars || [];

  const center = {
    yinYangGender: (chart && chart.yinYangGender) || '',
    mingZhu: (chart && chart.mingZhu) || '',
    shenZhu: (chart && chart.shenZhu) || '',
    wuxingJuName: (chart && chart.wuxingJuName) || '',
    lunarText: lunar.lunarYear
      ? `农历${lunar.lunarYear}年${lunar.lunarMonth}月${lunar.lunarDay}日`
      : '',
    pillarsText: pillars.length === 4 ? pillars.join(' ') : '',
    currentAge: (chart && chart.currentAge) || 0,
  };

  return { cells, center };
}

/**
 * 找到某个地支对应的宫格。
 *
 * @param {PalaceCell[]} cells
 * @param {number} branch
 * @returns {PalaceCell | null}
 */
export function cellAt(cells, branch) {
  return cells.find((c) => c.branch === branch) || null;
}

/**
 * 按顺序推进 N 宫（+1 逆时针 = 地支 +1，与 Web 端「自命宫起十二宫序」同向）。
 *
 * @param {number} branch 当前地支
 * @param {number} delta 位移
 * @returns {number} 新地支
 */
export function stepBranch(branch, delta) {
  return ((branch + delta) % 12 + 12) % 12;
}

/**
 * 网格坐标 → 地支（用于准星命中检测）。
 *
 * @param {number} row 0–3
 * @param {number} col 0–3
 * @returns {number | null} 地支索引；中宫返回 null
 */
export function branchAt(row, col) {
  for (const [branch, pos] of Object.entries(GRID_POS)) {
    if (pos[0] === row && pos[1] === col) return Number(branch);
  }
  return null;
}

/**
 * 按方向找相邻宫位（镜腿方向键导航）。
 *
 * 中宫不是宫位，所以「往里走」会原地不动 —— 宁可不动，也不要让用户
 * 以为选中了什么。越界同理。
 *
 * @param {number} branch 当前地支
 * @param {number} dx 列方向（-1 左 / +1 右）
 * @param {number} dy 行方向（-1 上 / +1 下）
 * @returns {number} 新地支；不动时返回原值
 */
export function neighborBranch(branch, dx, dy) {
  const pos = GRID_POS[branch];
  if (!pos) return branch;
  const row = Math.min(3, Math.max(0, pos[0] + dy));
  const col = Math.min(3, Math.max(0, pos[1] + dx));
  const next = branchAt(row, col);
  return next === null ? branch : next;
}

/**
 * 给选中的宫打上高亮标记（模板用动态 class 渲染高亮框）。
 *
 * @param {PalaceCell[]} cells
 * @param {number} branch 选中的地支
 * @returns {PalaceCell[]} 新数组（不改动入参）
 */
export function markActive(cells, branch) {
  return cells.map((c) => ({
    ...c,
    activeClass: c.branch === branch ? 'on' : '',
  }));
}
