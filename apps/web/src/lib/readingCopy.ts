/**
 * 解读面板 / 分享 / 报告三处的界面文案（中文 / English）。
 *
 * 只管界面骨架：标题、按钮、字段名、空态与错误提示。
 * 解读正文、维度原文、星曜名、宫位名、时辰名、四化名是数据集内容 —— 保持中文原文；
 * 维度名出现在界面位置（tab 标签等）时用「中文 (English)」双写。
 */

import type { Lang } from './quotaCopy';

/** 维度英文名（键同 @ziwei/core 的 READING_DIMENSIONS） */
export const DIMENSION_EN: Record<string, string> = {
  overview: 'Chart Overview',
  personality: 'Temperament',
  love: 'Love',
  career: 'Career',
  wealth: 'Wealth',
  health: 'Health',
  family: 'Siblings',
  children: 'Children',
  move: 'Migration',
  friends: 'Relationships',
  home: 'Property',
  spirit: 'Well-being',
  parents: 'Parents',
};

/** 四化名（数据集术语，两种语言都不翻） */
export const SIHUA_NAMES = { lu: '禄', quan: '权', ke: '科', ji: '忌' } as const;

/** 四化展示名（数据集术语，两种语言都不翻） */
export const SIHUA_LABELS = { lu: '化禄', quan: '化权', ke: '化科', ji: '化忌' } as const;

/** 农历月名（数据集术语，两种语言都不翻） */
export const CN_MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];

/** 维度名：中文界面纯中文；英文界面「English（中文）」；键不认识就显示原文 */
export function dimLabel(label: string, key: string, lang: 'zh' | 'en' = 'zh'): string {
  const en = DIMENSION_EN[key];
  if (!en) return label;
  return lang === 'en' ? `${en} (${label})` : label;
}

export interface ReadingCopy {
  // ── 解读面板 ───────────────────────────────────────────────
  panelTitle: string;
  panelEmpty: string;
  dimCount: (n: number) => string;
  dimsAria: string;
  currentDim: (label: string) => string;
  dimChars: (n: number) => string;
  askFollowUp: string;
  askFollowUpWith: (label: string) => string;
  dimEmpty: string;
  citationFull: (n: number) => string;
  citationDegraded: (n: number) => string;
  about: string;
  prevDim: (label: string) => string;
  nextDim: (label: string) => string;
  firstDim: string;
  lastDim: string;
  backToDims: string;
  // ── 分享 ───────────────────────────────────────────────────
  share: string;
  copySummary: string;
  copyLink: string;
  summaryCopied: string;
  linkCopied: string;
  copyFailed: string;
  chartDate: string;
  birthDate: (y: number, m: number, d: number) => string;
  shichen: (branch: string) => string;
  gender: (g: 'male' | 'female') => string;
  // ── 报告页 ─────────────────────────────────────────────────
  reportTitle: string;
  reportInvalidTitle: string;
  reportInvalidParams: string;
  reportInvalidFailed: string;
  reportInvalidHome: string;
  yearGanzhi: (year: number, ganzhi: string) => string;
  viewFullChart: string;
  liunianMing: string;
  liunianMingPrefix: string;
  natalStars: string;
  liunianMingNote: string;
  sihuaTitle: string;
  sihuaRow: (label: string, star: string) => string;
  sihuaPlace: (natal: string, branch: string, liunian: string | null) => string;
  placementsTitle: string;
  placementsCell: (natal: string, branch: string) => string;
  emptyPalace: string;
  daxianTitle: (start: number, end: number) => string;
  daxianMing: (palace: string, stem: string) => string;
  daxianSihua: (lu: string, quan: string, ke: string, ji: string) => string;
  daxianNote: string;
  overviewTitleZh: string;
  overviewTitleEn: string;
  overviewChars: (n: number) => string;
  overviewLink: string;
  liuyueTitle: (year: number) => string;
  liuyueItem: (label: string, palace: string) => string;
  reportFooter: string;
  reportFooterEnd: string;
  /** 中文括号包裹的原文（宫支 / 天干） */
  parens: (s: string) => string;
  /** 句号 */
  period: string;
}

const ZH: ReadingCopy = {
  // 解读面板
  panelTitle: '十三维解读',
  panelEmpty: '暂无解读维度可展示。可能是样本未覆盖，或引文处理后无可用正文。',
  dimCount: (n) => `共 ${n} 维`,
  dimsAria: '解读维度',
  currentDim: (label) => `当前维度：${label}`,
  dimChars: (n) => `本维 ${n.toLocaleString('zh-CN')} 字`,
  askFollowUp: '就此追问',
  askFollowUpWith: (label) => `就此追问 · 带着「${label}」继续问`,
  dimEmpty: '该维度暂无正文可展示（可能已被引文降级清空）。可切换其他维度继续阅读。',
  citationFull: (n) =>
    `解读中含《天纪》引文 ${n} 处，授权范围仅限非商业用途；商用或对外分发前需切换为引文降级。`,
  citationDegraded: (n) => `解读中的《天纪》引文已做降级处理（${n} 处）。`,
  about: '关于与口径',
  prevDim: (label) => `上一维 · ${label}`,
  nextDim: (label) => `下一维 · ${label}`,
  firstDim: '已是第一维',
  lastDim: '已是最后一维',
  backToDims: '回到维度列表',
  // 分享
  share: '分享',
  copySummary: '复制生辰摘要',
  copyLink: '复制本页链接',
  summaryCopied: '已复制摘要',
  linkCopied: '已复制链接',
  copyFailed: '复制未成功，请手动选中标题复制',
  chartDate: '排盘日',
  birthDate: (y, m, d) => `${y}年${m}月${d}日`,
  shichen: (branch) => `${branch}时`,
  gender: (g) => (g === 'male' ? '男' : '女'),
  // 报告页
  reportTitle: '年度运势报告',
  reportInvalidTitle: '无法生成报告',
  reportInvalidParams: '参数不完整，请从命盘页或首页进入。',
  reportInvalidFailed: '排盘失败。',
  reportInvalidHome: '回到首页',
  yearGanzhi: (year, ganzhi) => `${year} ${ganzhi}年`,
  viewFullChart: '看完整命盘',
  liunianMing: '流年命宫',
  liunianMingPrefix: '落在本命',
  natalStars: '本命主星：',
  liunianMingNote: '流年命宫是这一年的主舞台：流年十二宫都从这里起排。',
  sihuaTitle: '流年四化 · 四颗引动星',
  sihuaRow: (label, star) => `${label} · ${star}`,
  sihuaPlace: (natal, branch, liunian) =>
    `落本命${natal}（${branch}）${liunian ? `，即流年${liunian}` : ''}`,
  placementsTitle: '流年十二宫落位',
  placementsCell: (natal, branch) => `在本命${natal}${branch ? `（${branch}）` : ''}宫`,
  emptyPalace: '空宫',
  daxianTitle: (start, end) => `所处大限 · ${start}–${end} 岁`,
  daxianMing: (palace, stem) => `大限命宫在${palace}（${stem}）`,
  daxianSihua: (lu, quan, ke, ji) => `大限四化：禄 ${lu} · 权 ${quan} · 科 ${ke} · 忌 ${ji}`,
  daxianNote: '这步大限的十年里，流年层叠加在大限层之上看：先看大限给什么舞台，再看流年引动什么。',
  overviewTitleZh: '命格总览 · 数据集原文节选',
  overviewTitleEn: 'Chart overview · excerpt from the source dataset',
  overviewChars: (n) => `共 ${n.toLocaleString('zh-CN')} 字，完整版见`,
  overviewLink: '命盘解读',
  liuyueTitle: (year) => `${year} 各月流月命宫`,
  liuyueItem: (label, palace) => `${label} · 命宫在${palace}`,
  reportFooter:
    '本报告的盘面事实全部由确定性引擎计算，未覆盖的解读如实标注、不补写。流年流月为传统命理分层口径，仅供文化兴趣与学习参考，不构成任何决策建议。口径详见',
  reportFooterEnd: '。',
  parens: (s) => `（${s}）`,
  period: '。',
};

const EN: ReadingCopy = {
  // Reading panel
  panelTitle: 'Thirteen-dimension reading',
  panelEmpty: 'No reading dimension to show — the sample may not cover it, or citation processing left no text.',
  dimCount: (n) => `${n} dimensions`,
  dimsAria: 'Reading dimensions',
  currentDim: (label) => `Current dimension: ${label}`,
  dimChars: (n) => `${n.toLocaleString('en-US')} characters`,
  askFollowUp: 'Ask about this',
  askFollowUpWith: (label) => `Ask about this · continue with "${label}"`,
  dimEmpty: 'No text in this dimension (it may have been emptied by citation degradation). Switch to another dimension to keep reading.',
  citationFull: (n) =>
    `This reading quotes 《天纪》 ${n} time(s); the licence covers non-commercial use only — switch to citation degradation before commercial use or redistribution.`,
  citationDegraded: (n) => `《天纪》 citations in this reading have been degraded (${n} in total).`,
  about: 'About & methodology',
  prevDim: (label) => `Prev · ${label}`,
  nextDim: (label) => `Next · ${label}`,
  firstDim: 'First dimension',
  lastDim: 'Last dimension',
  backToDims: 'Back to the dimension list',
  // Share
  share: 'Share',
  copySummary: 'Copy birth summary',
  copyLink: 'Copy page link',
  summaryCopied: 'Summary copied',
  linkCopied: 'Link copied',
  copyFailed: 'Copy failed — select the text and copy it manually',
  chartDate: 'Chart date',
  birthDate: (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
  shichen: (branch) => `${branch} hour`,
  gender: (g) => (g === 'male' ? 'Male' : 'Female'),
  // Report page
  reportTitle: 'Annual fortune report',
  reportInvalidTitle: 'Report unavailable',
  reportInvalidParams: 'Incomplete parameters — open it from the chart page or the home page.',
  reportInvalidFailed: 'Charting failed.',
  reportInvalidHome: 'Back home',
  yearGanzhi: (year, ganzhi) => `${year} ${ganzhi}`,
  viewFullChart: 'View the full chart',
  liunianMing: 'Annual life palace',
  liunianMingPrefix: 'Falls in natal',
  natalStars: 'Natal major stars:',
  liunianMingNote: 'The annual life palace is this year’s main stage: the twelve annual palaces all start from here.',
  sihuaTitle: 'Annual four transformations · four triggering stars',
  sihuaRow: (label, star) => `${label} · ${star}`,
  sihuaPlace: (natal, branch, liunian) =>
    `Falls in natal ${natal} (${branch})${liunian ? ` — annual ${liunian}` : ''}`,
  placementsTitle: 'Where the twelve annual palaces fall',
  placementsCell: (natal, branch) => `in natal ${natal}${branch ? ` (${branch})` : ''}`,
  emptyPalace: 'Empty palace',
  daxianTitle: (start, end) => `Current major period · ages ${start}–${end}`,
  daxianMing: (palace, stem) => `Major-period life palace: ${palace} (${stem})`,
  daxianSihua: (lu, quan, ke, ji) => `Major-period transformations: 禄 ${lu} · 权 ${quan} · 科 ${ke} · 忌 ${ji}`,
  daxianNote:
    'Across this ten-year major period, the annual layer is read on top of the major-period layer: first the stage the period sets, then what the year triggers.',
  overviewTitleZh: '命格总览 · 数据集原文节选',
  overviewTitleEn: 'Chart overview · excerpt from the source dataset',
  overviewChars: (n) => `${n.toLocaleString('en-US')} characters — full version in`,
  overviewLink: 'Chart reading',
  liuyueTitle: (year) => `${year} monthly life palaces`,
  liuyueItem: (label, palace) => `${label} · life palace ${palace}`,
  reportFooter:
    'Every chart fact in this report is computed by the deterministic engine; readings that are not covered are marked as such and never invented. Annual and monthly layers follow the traditional layered reading, offered for cultural interest and study only, and are not decision advice. See',
  reportFooterEnd: '.',
  parens: (s) => `(${s})`,
  period: '.',
};

export const READING_COPY: Record<Lang, ReadingCopy> = { zh: ZH, en: EN };
