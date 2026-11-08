/**
 * 命盘盘面域的界面文案（中文 / English）。
 *
 * 只管界面骨架：tab 名、面板标题、按钮、图例、工具提示、空态与错误提示。
 *
 * 不翻（数据集术语，原样展示）：星曜名（紫微、天府…）、四化字（禄/权/科/忌）、干支、地支、度数、解读原文。
 * 宫位名同属数据集术语，但作为界面标签时用「中文 (English)」形式（命宫 (Life Palace)）。
 */

import type { Lang } from './quotaCopy';

/* ── 术语对照（与语言无关的固定映射） ───────────────────────────── */

/** 宫位名 → English（引擎用「交友宫」，界面别处也可能叫「朋友宫」） */
export const PALACE_EN: Record<string, string> = {
  命宫: 'Life Palace',
  身宫: 'Body Palace',
  兄弟宫: 'Siblings Palace',
  夫妻宫: 'Spouse Palace',
  子女宫: 'Children Palace',
  财帛宫: 'Wealth Palace',
  疾厄宫: 'Health Palace',
  迁移宫: 'Travel Palace',
  交友宫: 'Friends Palace',
  朋友宫: 'Friends Palace',
  官禄宫: 'Career Palace',
  田宅宫: 'Property Palace',
  福德宫: 'Fortune Palace',
  父母宫: 'Parents Palace',
};

/** 宫位名 → 紧凑徽标用的英文短名 */
const PALACE_EN_SHORT: Record<string, string> = {
  命宫: 'Life',
  身宫: 'Body',
  兄弟宫: 'Siblings',
  夫妻宫: 'Spouse',
  子女宫: 'Children',
  财帛宫: 'Wealth',
  疾厄宫: 'Health',
  迁移宫: 'Travel',
  交友宫: 'Friends',
  朋友宫: 'Friends',
  官禄宫: 'Career',
  田宅宫: 'Property',
  福德宫: 'Fortune',
  父母宫: 'Parents',
};

/** 四化 → English */
export const SIHUA_EN: Record<string, string> = {
  禄: 'Wealth',
  权: 'Authority',
  科: 'Fame',
  忌: 'Obstruction',
};

/** 时辰（地支）→ 拼音 —— 界面标签用「Zi hour」，盘面干支仍用汉字 */
const SHICHEN_EN: Record<string, string> = {
  子: 'Zi',
  丑: 'Chou',
  寅: 'Yin',
  卯: 'Mao',
  辰: 'Chen',
  巳: 'Si',
  午: 'Wu',
  未: 'Wei',
  申: 'Shen',
  酉: 'You',
  戌: 'Xu',
  亥: 'Hai',
};

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * 宫位标签：中文模式只给汉字；英文模式给「中文 (English)」。
 * compact = 紧凑徽标（去掉「宫」字，英文用短名）。
 */
export function palaceLabel(name: string, lang: Lang, compact = false): string {
  if (lang === 'zh') return compact ? name.replace(/宫$/, '') : name;
  const en = PALACE_EN[name];
  if (!en) return name;
  return compact ? `${name.replace(/宫$/, '')} (${PALACE_EN_SHORT[name] ?? en})` : `${name} (${en})`;
}

/** 四化标签：英文模式给「禄 (Wealth)」 */
export function siHuaLabel(siHua: string, lang: Lang): string {
  if (lang === 'zh') return siHua;
  const en = SIHUA_EN[siHua];
  return en ? `${siHua} (${en})` : siHua;
}

/* ── 文案 ─────────────────────────────────────────────────────── */

export interface ChartCopy {
  // ── 页面骨架 ──
  invalidTitle: string;
  invalidParams: string;
  invalidFailed: string;
  backToInput: string;
  methodology: string;
  methodologyLong: string;
  recast: string;
  detailsChip: string;
  chartDateLabel: string;
  noSolarCorrection: string;
  lateZiShift: string;
  lateZiShiftTitle: string;
  lateZiNote: (birth: string, chartDate: string, hour: string) => string;
  // ── 摘要行 ──
  summaryDate: (y: number, m: number, d: number) => string;
  summaryHour: (shichen: string) => string;
  summaryHourRange: (shichen: string, range: string) => string;
  genderMale: string;
  genderFemale: string;
  // ── 盘面 ──
  boardAria: string;
  listSeparator: string;
  siHuaLegendLabel: string;
  siHuaIntro: string;
  siHuaTooltip: (siHua: string) => string;
  siHuaOfTitle: (layer: string, siHua: string) => string;
  layerPalaceTitle: (layer: string, palace: string) => string;
  emptyPalace: string;
  emptyPalaceShort: string;
  majorStars: (names: string) => string;
  mingGong: string;
  shenGong: string;
  /** 宫格角标（命 / 身） */
  mingMark: string;
  shenMark: string;
  currentDaXian: string;
  daXian: string;
  liuNian: string;
  liuYue: string;
  liunianLifeAt: string;
  layerHint: string;
  miniBoardAria: string;
  annualLifePalace: string;
  annualPalaceHint: string;
  natal: string;
  selected: string;
  sanFangLink: string;
  selfSiHua: (siHua: string) => string;
  selfSiHuaTitle: (siHua: string) => string;
  borrowLabel: string;
  borrowedFrom: (name: string) => string;
  borrowedStarsTitle: (name: string, stars: string) => string;
  askHere: string;
  tapPalaceHint: string;
  tapPalaceHintShort: string;
  brightnessHint: string;
  selectedSr: (palace: string) => string;
  // ── 中宫 ──
  lifeMaster: string;
  bodyMaster: string;
  nominalAge: (age: number) => string;
  timeLayerAria: string;
  annualYearAria: string;
  monthlyMonthAria: string;
  lifePalaceAt: string;
  askThisYear: string;
  askThisLimit: string;
  readInterpretation: string;
  goAsk: string;
  annualReport: string;
  proLayer: string;
  fourPillars: string;
  pillarLabels: [string, string, string, string];
  ziweiDouShu: string;
  ziweiLabel: string;
  inPalace: (branch: string) => string;
  branchPalace: (branch: string) => string;
  lunarYear: (stemBranch: string) => string;
  lunarMonth: (leap: boolean, cnMonth: string, monthNo: number) => string;
  lunarDay: (cnDay: string, dayNo: number) => string;
  // ── 迷你盘 ──
  miniAria: string;
  miniLegendNote: string;
  // ── 运势卡 ──
  fortuneAria: (label: string) => string;
  annualMingGong: string;
  natalMajorStars: string;
  askThisYearArrow: string;
  annualNote: string;
  // ── tab ──
  tabChart: string;
  tabReading: string;
  tabListAria: string;
  askPalaceSeed: (palace: string) => string;
  askDimensionSeed: (label: string) => string;
  askYearSeed: string;
  askLimitSeed: string;
}

const ZH: ChartCopy = {
  // ── 页面骨架 ──
  invalidTitle: '无法排盘',
  invalidParams: '参数不完整或超出范围，请回到输入页重新填写生辰。',
  invalidFailed: '排盘失败，请检查出生日期是否合法。',
  backToInput: '回到输入页',
  methodology: '口径说明',
  methodologyLong: '查看口径说明',
  recast: '重新排盘',
  detailsChip: '详情',
  chartDateLabel: '排盘日',
  noSolarCorrection: '未做真太阳时校正',
  lateZiShift: '晚子时顺延',
  lateZiShiftTitle: '晚子时已按传统规则顺延排盘日',
  lateZiNote: (birth, chartDate, hour) =>
    `晚子时已顺延：输入日期 ${birth} 属晚子时（23:00–23:59），排盘日顺延至 ${chartDate}，时辰为 ${hour}。`,
  // ── 摘要行 ──
  summaryDate: (y, m, d) => `${y}年${m}月${d}日`,
  summaryHour: (shichen) => `${shichen}时`,
  summaryHourRange: (shichen, range) => `${shichen}时（${range}）`,
  genderMale: '男',
  genderFemale: '女',
  // ── 盘面 ──
  boardAria: '十二宫命盘',
  listSeparator: '，',
  siHuaLegendLabel: '四化',
  siHuaIntro: '四化：',
  siHuaTooltip: (siHua) => `四化：${siHua}`,
  siHuaOfTitle: (layer, siHua) => `${layer}四化：${siHua}`,
  layerPalaceTitle: (layer, palace) => `${layer}${palace}`,
  emptyPalace: '空宫',
  emptyPalaceShort: '空',
  majorStars: (names) => `主星${names}`,
  mingGong: '命宫',
  shenGong: '身宫',
  mingMark: '命',
  shenMark: '身',
  currentDaXian: '当前大限',
  daXian: '大限',
  liuNian: '流年',
  liuYue: '流月',
  liunianLifeAt: '流年命在',
  layerHint: '流年层：宫名带框 + 流年四化',
  miniBoardAria: '命盘缩略图',
  annualLifePalace: '流年命宫',
  annualPalaceHint: '流年四化由流年天干推出，落在本命盘对应宫位。点上方「就今年追问」可让助手结合解读原文细说。',
  natal: '本命',
  selected: '已选中',
  sanFangLink: '三方四正关联',
  selfSiHua: (siHua) => `自化${siHua}`,
  selfSiHuaTitle: (siHua) => `宫干自化${siHua}`,
  borrowLabel: '借',
  borrowedFrom: (name) => `借${name}`,
  borrowedStarsTitle: (name, stars) => `借${name}：${stars}`,
  askHere: '就此追问',
  tapPalaceHint: '点宫位看三方四正 · 中宫可切本命 / 大限 / 流年',
  tapPalaceHintShort: '点宫位看三方四正',
  brightnessHint: '庙旺为星金，陷落为浅灰',
  selectedSr: (palace) => `已选择${palace}，并高亮其三方四正`,
  // ── 中宫 ──
  lifeMaster: '命主',
  bodyMaster: '身主',
  nominalAge: (age) => `虚岁 ${age} 岁`,
  timeLayerAria: '时间层',
  annualYearAria: '流年年份',
  monthlyMonthAria: '流月月份',
  lifePalaceAt: '命宫在',
  askThisYear: '就今年追问',
  askThisLimit: '就这步大限追问',
  readInterpretation: '看解读',
  goAsk: '去追问',
  annualReport: '年报',
  proLayer: '专业层 · 四柱与落宫',
  fourPillars: '四柱',
  pillarLabels: ['年', '月', '日', '时'],
  ziweiDouShu: '紫微斗数',
  ziweiLabel: '紫微',
  inPalace: (branch) => `在${branch}宫`,
  branchPalace: (branch) => `${branch}宫`,
  lunarYear: (stemBranch) => `${stemBranch}年`,
  lunarMonth: (leap, cnMonth) => `${leap ? '闰' : ''}${cnMonth}月`,
  lunarDay: (cnDay) => cnDay,
  // ── 迷你盘 ──
  miniAria: '命盘缩略图',
  miniLegendNote: '流年层：宫名带框 + 流年四化',
  // ── 运势卡 ──
  fortuneAria: (label) => `${label} 运势`,
  annualMingGong: '流年命宫',
  natalMajorStars: '本命主星',
  askThisYearArrow: '就今年追问 →',
  annualNote:
    '流年四化由流年天干推出，落在本命盘对应宫位。点上方「就今年追问」可让助手结合解读原文细说。',
  // ── tab ──
  tabChart: '命盘',
  tabReading: '解读',
  tabListAria: '盘面视图',
  askPalaceSeed: (palace) => `帮我看看我的${palace}。`,
  askDimensionSeed: (label) => `帮我看看${label}方面，原文是怎么说的？`,
  askYearSeed: '今年流年整体如何？流年命宫和流年四化带来了什么？',
  askLimitSeed: '当前这步大限整体如何？大限命宫和大限四化怎么看？',
};

const EN: ChartCopy = {
  // ── 页面骨架 ──
  invalidTitle: 'Cannot build the chart',
  invalidParams: 'Incomplete or out-of-range parameters — go back to the input page and re-enter the birth data.',
  invalidFailed: 'Chart failed — check that the birth date is valid.',
  backToInput: 'Back to input',
  methodology: 'Methodology',
  methodologyLong: 'About the methodology',
  recast: 'Recast',
  detailsChip: 'Details',
  chartDateLabel: 'Chart date',
  noSolarCorrection: 'No true-solar-time correction applied',
  lateZiShift: 'Late-Zi shift',
  lateZiShiftTitle: 'The late Zi hour shifted the chart date, per the traditional rule',
  lateZiNote: (birth, chartDate, hour) =>
    `Late Zi hour shifted: the entered date ${birth} falls in the late Zi hour (23:00–23:59), so the chart date moves to ${chartDate} and the hour is ${hour}.`,
  // ── 摘要行 ──
  summaryDate: (y, m, d) => `${EN_MONTHS[m - 1] ?? ''} ${d}, ${y}`,
  summaryHour: (shichen) => `${SHICHEN_EN[shichen] ?? shichen} hour`,
  summaryHourRange: (shichen, range) => `${SHICHEN_EN[shichen] ?? shichen} hour (${range})`,
  genderMale: 'Male',
  genderFemale: 'Female',
  // ── 盘面 ──
  boardAria: 'Twelve-palace chart',
  listSeparator: ', ',
  siHuaLegendLabel: 'Four transformations',
  siHuaIntro: 'Four transformations: ',
  siHuaTooltip: (siHua) => `Four transformation: ${siHuaLabel(siHua, 'en')}`,
  siHuaOfTitle: (layer, siHua) => `${layer} four transformation: ${siHuaLabel(siHua, 'en')}`,
  layerPalaceTitle: (layer, palace) => `${layer}: ${palace}`,
  emptyPalace: 'Empty palace',
  emptyPalaceShort: 'Empty',
  majorStars: (names) => `Main stars ${names}`,
  mingGong: palaceLabel('命宫', 'en'),
  shenGong: palaceLabel('身宫', 'en'),
  mingMark: 'Life',
  shenMark: 'Body',
  currentDaXian: 'Current major limit',
  daXian: 'Major limit',
  liuNian: 'Annual',
  liuYue: 'Monthly',
  liunianLifeAt: 'Annual Life Palace at',
  layerHint: 'Annual layer: framed palace names + annual transformations',
  miniBoardAria: 'Chart thumbnail',
  annualLifePalace: 'Annual Life Palace',
  annualPalaceHint: 'The annual transformations follow the year stem and land on your natal palaces. Tap “Ask about this year” above to have the assistant elaborate from the dataset text.',
  natal: 'Natal',
  selected: 'Selected',
  sanFangLink: 'Trine linked',
  selfSiHua: (siHua) => `Self ${siHuaLabel(siHua, 'en')}`,
  selfSiHuaTitle: (siHua) => `Palace-stem self transformation: ${siHuaLabel(siHua, 'en')}`,
  borrowLabel: 'Borrowed',
  borrowedFrom: (name) => `Borrowed from ${name}`,
  borrowedStarsTitle: (name, stars) => `Borrowed from ${name}: ${stars}`,
  askHere: 'Ask about this',
  tapPalaceHint: 'Tap a palace for the trine · switch natal / major limit / annual in the center',
  tapPalaceHintShort: 'Tap a palace for the trine',
  brightnessHint: 'Temple & peak stars in gold, fallen stars in light grey',
  selectedSr: (palace) => `Selected ${palace}; its trine is highlighted`,
  // ── 中宫 ──
  lifeMaster: 'Life master',
  bodyMaster: 'Body master',
  nominalAge: (age) => `Age ${age}`,
  timeLayerAria: 'Time layer',
  annualYearAria: 'Annual year',
  monthlyMonthAria: 'Monthly period',
  lifePalaceAt: 'Life palace at',
  askThisYear: 'Ask about this year',
  askThisLimit: 'Ask about this major limit',
  readInterpretation: 'Read interpretation',
  goAsk: 'Ask',
  annualReport: 'Annual report',
  proLayer: 'Advanced · Four pillars & placement',
  fourPillars: 'Four pillars',
  pillarLabels: ['Year', 'Month', 'Day', 'Hour'],
  ziweiDouShu: 'Zi Wei Dou Shu',
  ziweiLabel: '紫微 (Zi Wei)',
  inPalace: (branch) => `In the ${branch} palace`,
  branchPalace: (branch) => `${branch} palace`,
  lunarYear: (stemBranch) => `${stemBranch} year`,
  lunarMonth: (leap, _cnMonth, monthNo) => `${leap ? 'Leap ' : ''}Month ${monthNo}`,
  lunarDay: (_cnDay, dayNo) => `Day ${dayNo}`,
  // ── 迷你盘 ──
  miniAria: 'Chart thumbnail',
  miniLegendNote: 'Annual layer: boxed palace name + annual transformations',
  // ── 运势卡 ──
  fortuneAria: (label) => `${label} fortune`,
  annualMingGong: 'Annual life palace',
  natalMajorStars: 'Natal main stars',
  askThisYearArrow: 'Ask about this year →',
  annualNote:
    'The annual transformations come from the annual heavenly stem and land in the matching natal palaces. Tap "Ask about this year" above to have the assistant expand with the source text.',
  // ── tab ──
  tabChart: 'Chart',
  tabReading: 'Interpretation',
  tabListAria: 'Chart views',
  askPalaceSeed: (palace) => `Tell me about my ${palaceLabel(palace, 'en')}.`,
  askDimensionSeed: (label) => `What does the source text say about ${label}?`,
  askYearSeed: 'How is this year overall? What do the annual life palace and the annual transformations bring?',
  askLimitSeed: 'How is this major limit overall? How do the limit life palace and the limit transformations read?',
};

export const CHART_COPY: Record<Lang, ChartCopy> = { zh: ZH, en: EN };
