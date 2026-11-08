/**
 * 合盘 / 关于 / 页脚 / 错误页 的界面文案（中文 / English）。
 *
 * 命理术语保留中文原词并加英文释义（十二宫 (Twelve Palaces)、大限 (Decade Luck)、
 * 四化 (Four Transformations)…），整段说明文字翻成通顺英文 —— 英文用户要能读懂产品与口径。
 * 盘面星名与解读正文是数据集原文，不走这里。
 */

import type { Lang } from './quotaCopy';

/** 十二地支 / 十二时辰的拼音（英文释义用） */
const PINYIN: Record<string, string> = {
  子: 'Zi', 丑: 'Chou', 寅: 'Yin', 卯: 'Mao', 辰: 'Chen', 巳: 'Si',
  午: 'Wu', 未: 'Wei', 申: 'Shen', 酉: 'You', 戌: 'Xu', 亥: 'Hai',
};

/** 十二宫英文释义 */
const PALACE_EN: Record<string, string> = {
  命宫: 'Life Palace',
  兄弟宫: 'Sibling Palace',
  夫妻宫: 'Spouse Palace',
  子女宫: 'Children Palace',
  财帛宫: 'Wealth Palace',
  疾厄宫: 'Health Palace',
  迁移宫: 'Travel Palace',
  交友宫: 'Friendship Palace',
  官禄宫: 'Career Palace',
  田宅宫: 'Property Palace',
  福德宫: 'Fortune Palace',
  父母宫: 'Parents Palace',
};

/** 四化英文释义 */
const SIHUA_EN: Record<string, string> = {
  禄: 'Lu', 权: 'Quan', 科: 'Ke', 忌: 'Ji',
};

/** 十三维解读的中英文（中文与引擎的 DIMENSION_LABELS 逐字一致） */
const DIMENSION_TEXT: Record<string, { zh: string; en: string }> = {
  overview: { zh: '命格总览', en: 'Chart overview' },
  personality: { zh: '性格', en: 'Personality' },
  love: { zh: '感情', en: 'Love & relationships' },
  career: { zh: '事业', en: 'Career' },
  wealth: { zh: '财运', en: 'Wealth' },
  health: { zh: '健康', en: 'Health' },
  family: { zh: '兄弟', en: 'Siblings' },
  children: { zh: '子女', en: 'Children' },
  move: { zh: '迁移', en: 'Travel & relocation' },
  friends: { zh: '人际', en: 'Friendship' },
  home: { zh: '田宅', en: 'Home & property' },
  spirit: { zh: '福德', en: 'Inner well-being' },
  parents: { zh: '父母', en: 'Parents' },
};

export interface SiteCopy {
  // ── 品牌 ───────────────────────────────────────────────
  brand: string;

  // ── 免责声明 / 署名（页脚与关于页共用）──────────────────
  disclaimer: string;
  datasetTitle: string;
  datasetIntro: string;
  datasetSource: string;
  datasetAuthor: string;
  datasetLicense: string;
  engineNote: string;

  // ── 页脚 ───────────────────────────────────────────────
  footerMethodology: string;
  footerReadingData: string;
  footerAttribution: string;
  footerRecast: string;
  footerDatasetRepo: string;

  // ── 错误页（ErrorAlert）────────────────────────────────
  errorTitle: string;
  errorHint: string;

  // ── 404 ────────────────────────────────────────────────
  notFoundTitle: string;
  notFoundBody: string;
  notFoundHome: string;
  notFoundAbout: string;
  loadingGeneric: string;
  loadingChart: string;
  loadingAbout: string;
  notCoveredTitle: string;
  notCoveredYearsLead: string;
  notCoveredBody: string;
  notCoveredRetry: string;
  notCoveredCoverage: string;
  notCoveredNone: string;
  notCoveredRange: (from: number, to: number, count: number) => string;
  copyLink: string;
  copied: string;
  appErrorTitle: string;
  appErrorBody: string;
  retry: string;
  backHome: string;
  chartErrorTitle: string;
  chartErrorBody: string;

  // ── 合盘页 ─────────────────────────────────────────────
  synTitle: string;
  synEyebrow: string;
  synIntro: string;
  synEdit: string;
  synPersonA: string;
  synPersonB: string;
  synCastFailed: (detail: string) => string;
  synMingPalace: (stars: string, branch: string) => string;
  synSpousePalace: (stars: string, branch: string) => string;
  synEmptyPalace: string;
  synCrossTitle: string;
  synSihuaRow: (label: string, star: string) => string;
  synLandsIn: (palace: string) => string;
  synNoStar: string;
  synFooterLead: string;
  synChartLink: string;
  synFooterTail: string;

  // ── 合盘表单 ───────────────────────────────────────────
  formName: string;
  formNamePlaceholderA: string;
  formNamePlaceholderB: string;
  formGender: string;
  formSelect: string;
  formMale: string;
  formFemale: string;
  formBirthDate: string;
  formBirthHour: string;
  formFromProfiles: string;
  formSubmit: string;
  formNote: string;

  // ── 关于页 ─────────────────────────────────────────────
  aboutTitle: string;
  aboutIntro: string;
  aboutSectionMethod: string;
  aboutMethodHourLead: string;
  aboutMethodHourBody: string;
  aboutHourSep: string;
  aboutHourEnd: string;
  aboutMethodDateLead: string;
  aboutMethodDateBody: string;
  aboutMethodLateZiLead: string;
  aboutMethodLateZiBody: string;
  aboutMethodBirthplaceLead: string;
  aboutMethodBirthplaceBody: string;
  aboutSectionLookup: string;
  aboutLookupKeyLead: string;
  aboutLookupKeyFormat: string;
  aboutLookupKeyTail: string;
  aboutLookupYearsLead: string;
  aboutLookupYearsNone: string;
  aboutLookupYearsRange: (from: number, to: number, count: number) => string;
  aboutLookupRecords: (n: string) => string;
  aboutLookupMissing: string;
  aboutSectionDimensions: string;
  aboutDimensionsIntro: string;
  aboutSectionImpl: string;
  aboutImplLayout: string;
  aboutImplMarkdown: string;
  aboutSectionCredits: string;
  aboutCreditsNi: string;
  aboutCta: string;

  // ── 术语表（中文原词 + 英文释义）───────────────────────
  palaceLabel: (name: string) => string;
  sihuaLabel: (label: string) => string;
  dimensionLabel: (key: string) => string;
  shichenLabel: (name: string) => string;
  branchLabel: (name: string) => string;
  starJoin: string;
  birthLine: (year: number, month: number, day: number, shichen: string) => string;
}

const ZH: SiteCopy = {
  brand: '紫微助手',
  disclaimer: '本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。',
  datasetTitle: '紫微斗数开源解读数据集 v4.0',
  datasetIntro:
    '本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）以及开源排盘引擎。',
  datasetSource: '来源：',
  datasetAuthor: '作者：王多鱼AI',
  datasetLicense: '数据集许可：CC BY 4.0；引擎代码：MIT。',
  engineNote:
    '排盘由确定性引擎计算，不使用大模型推算星曜与宫位；解读正文均检索自上述开源数据集，样本库未覆盖的生辰会如实标注，不做任何补写。',
  footerMethodology: '口径说明',
  footerReadingData: '解读数据：',
  footerAttribution: '（王多鱼AI，CC BY 4.0）',
  footerRecast: '重新排盘',
  footerDatasetRepo: '数据集 GitHub',
  errorTitle: '无法完成排盘',
  errorHint: '请核对下方表单中的出生日期与时辰后重试。',
  notFoundTitle: '页面不存在',
  notFoundBody: '没有找到你访问的页面。可能是链接写错了，或内容已移除。',
  notFoundHome: '回首页排盘',
  notFoundAbout: '关于与口径',
  loadingGeneric: '页面加载中…',
  loadingChart: '正在排布十二宫…',
  loadingAbout: '正在加载口径说明…',
  notCoveredTitle: '这个生辰暂时没有解读',
  notCoveredYearsLead: '目前可解读的出生年份：',
  notCoveredBody: '命盘照常排出；解读只采用已有材料，没有覆盖的年份不会用编造的内容填补。',
  notCoveredRetry: '换一个年份重试',
  notCoveredCoverage: '查看覆盖年份',
  notCoveredNone: '（无）',
  notCoveredRange: (from, to, count) => `（共 ${count} 年）`,
  copyLink: '复制链接',
  copied: '已复制',
  appErrorTitle: '出了点问题',
  appErrorBody: '页面加载或渲染时遇到意外错误。可以重试，或先回到首页重新排盘。',
  retry: '重试',
  backHome: '回首页',
  chartErrorTitle: '命盘页出了点问题',
  chartErrorBody: '这张盘暂时无法展示，可能是网络波动或页面加载异常。可以重试，或回到首页重新填写生辰。',
  synTitle: '双人合盘',
  synEyebrow: '双人合盘',
  synIntro:
    '输入两个人的生辰（或从档案直接选），看双方四化互飞与夫妻宫对照。互飞只列确定性的盘面事实，不做吉凶断语。',
  synEdit: '修改参数',
  synPersonA: '甲方',
  synPersonB: '乙方',
  synCastFailed: (detail) => (detail ? `排盘失败。（${detail}）` : '排盘失败。'),
  synMingPalace: (stars, branch) => `命宫：${stars}（${branch}）`,
  synSpousePalace: (stars, branch) => `夫妻宫：${stars}（${branch}）`,
  synEmptyPalace: '空宫',
  synCrossTitle: '四化互飞 · 一方的生年四化星落在对方盘的哪一宫',
  synSihuaRow: (label, star) => `化${label} · ${star}`,
  synLandsIn: (palace) => `落对方${palace}`,
  synNoStar: '盘（星不在对方盘）',
  synFooterLead:
    '互飞四化是确定性的盘面事实（一方的生年四化星确实落在对方某宫）。合盘的吉凶解读不在数据集覆盖范围内，这里不做断语。各人本命的详细解读请看各自的',
  synChartLink: '命盘对话',
  synFooterTail: '。仅供文化兴趣与学习参考。',
  formName: '姓名（可选）',
  formNamePlaceholderA: '如：小张',
  formNamePlaceholderB: '如：小李',
  formGender: '性别',
  formSelect: '请选择',
  formMale: '男',
  formFemale: '女',
  formBirthDate: '出生日期（公历）',
  formBirthHour: '出生时辰',
  formFromProfiles: '从档案选：',
  formSubmit: '看合盘',
  formNote:
    '性别决定大限顺逆、时辰决定整张盘，所以两项都不预填 —— 请各自选好，两个人四个项都选齐才能看合盘。',
  aboutTitle: '关于与口径',
  aboutIntro:
    '紫微助手把公历生辰排成十二宫命盘，并检索对应的十三维解读。排盘是确定性计算，解读是数据集原文检索——两个环节都不经过大模型推算。',
  aboutSectionMethod: '排盘口径',
  aboutMethodHourLead: '时辰是序号，不是钟点。',
  aboutMethodHourBody:
    '时辰序号 0–11（子=0、丑=1 …… 亥=11），与解读数据集的键口径完全一致。各时辰对应的钟点区间：',
  aboutHourSep: '；',
  aboutHourEnd: '。',
  aboutMethodDateLead: '日期是公历排盘日。',
  aboutMethodDateBody:
    '直接按输入的公历年月日排盘，不做农历换算输入，也不做真太阳时校正 —— 因为数据集本身没有做，校正会导致检索键与盘面错位。',
  aboutMethodLateZiLead: '晚子时按次日排盘。',
  aboutMethodLateZiBody:
    '23:00–23:59 出生者，排盘日顺延至次日，时辰仍为子时（序号 0）。用「按钟点」输入时会自动应用这条规则；用「按时辰」输入时，需要自行选择「当日子时」或「晚子时」。',
  aboutMethodBirthplaceLead: '出生地不影响排盘。',
  aboutMethodBirthplaceBody: '本版不采集出生地，也不做真太阳时与夏令时校正。',
  aboutSectionLookup: '解读是怎么找到的',
  aboutLookupKeyLead: '检索键格式为',
  aboutLookupKeyFormat: 'YYYY-MM-DD-时辰序号-性别',
  aboutLookupKeyTail: '，与数据集逐字对齐。键命中即返回该盘十三维 Markdown 原文。',
  aboutLookupYearsLead: '当前样本库已建索引年份：',
  aboutLookupYearsNone: '（无）',
  aboutLookupYearsRange: (from, to, count) => `${from}–${to}（共 ${count} 年）`,
  aboutLookupRecords: (n) => `共 ${n} 条记录。`,
  aboutLookupMissing:
    '未建索引或该键不存在的生辰，页面会如实显示「样本库未覆盖」，不会用任何生成内容替代。',
  aboutSectionDimensions: '十三维解读',
  aboutDimensionsIntro: '每盘解读固定包含以下十三个维度，顺序固定：',
  aboutSectionImpl: '界面实现说明',
  aboutImplLayout:
    '十二宫格盘面的四四方阵布局参考了上游 MIT 项目 `components/ChartBoard.tsx` 与 `components/PalaceCell.tsx` 的结构思路，视觉实现与交互为本项目重写。参考代码保留在 `vendor/upstream-reference/` ，许可证见同目录 LICENSE。',
  aboutImplMarkdown:
    '解读正文的排版使用本项目自带的轻量 Markdown 渲染器，只覆盖数据集里实际出现的构造（小标题、加粗、斜体、列表、引用、分隔线），不引入完整 Markdown 依赖。',
  aboutSectionCredits: '署名与许可',
  aboutCreditsNi:
    '倪海厦《天纪》原话不在数据集的 CC BY 4.0 覆盖范围内，不得批量商用；数据集已排除该部分内容。',
  aboutCta: '去排一张盘',
  palaceLabel: (name) => name,
  sihuaLabel: (label) => label,
  dimensionLabel: (key) => DIMENSION_TEXT[key]?.zh ?? key,
  shichenLabel: (name) => `${name}时`,
  branchLabel: (name) => name,
  starJoin: '、',
  birthLine: (y, m, d, shichen) => `${y}年${m}月${d}日 ${shichen}`,
};

const EN: SiteCopy = {
  brand: 'Ziwei Assistant',
  disclaimer:
    'For cultural interest and study only. Not medical, legal, investment, or life-decision advice.',
  datasetTitle: 'Ziwei Doushu Open Reading Dataset v4.0',
  datasetIntro:
    'This project uses the “Ziwei Doushu Open Reading Dataset v4.0” (674,976 charts × 13 dimensions) together with an open-source chart-casting engine.',
  datasetSource: 'Source:',
  datasetAuthor: 'Author: 王多鱼AI',
  datasetLicense: 'Dataset license: CC BY 4.0. Engine code: MIT.',
  engineNote:
    'Charts are computed by a deterministic engine — no large model is used to infer stars or palaces. Every reading is retrieved verbatim from the open dataset above; birth data outside the sample library is reported as such, never filled in.',
  footerMethodology: 'Methodology',
  footerReadingData: 'Reading data:',
  footerAttribution: ' (王多鱼AI, CC BY 4.0)',
  footerRecast: 'Cast a new chart',
  footerDatasetRepo: 'Dataset on GitHub',
  errorTitle: 'Could not cast the chart',
  errorHint: 'Check the birth date and time in the form below, then try again.',
  notFoundTitle: 'Page not found',
  notFoundBody:
    'We could not find that page. The link may be wrong, or the content may have been removed.',
    notFoundHome: 'Back to casting',
  notFoundAbout: 'About & method',
  loadingGeneric: 'Loading…',
  loadingChart: 'Laying out the twelve palaces…',
  loadingAbout: 'Loading the method notes…',
  notCoveredTitle: 'No interpretation for this birth data yet',
  notCoveredYearsLead: 'Currently indexed birth years:',
  notCoveredBody: 'The chart is still cast; the reading only uses existing material — uncovered years are never filled with invented content.',
  notCoveredRetry: 'Try another year',
  notCoveredCoverage: 'See covered years',
  notCoveredNone: '(none)',
  notCoveredRange: (from, to, count) => ` (${count} years)`,
  copyLink: 'Copy link',
  copied: 'Copied',
  appErrorTitle: 'Something went wrong',
  appErrorBody: 'The page hit an unexpected error while loading or rendering. You can retry, or go back home and cast again.',
  retry: 'Retry',
  backHome: 'Back home',
  chartErrorTitle: 'The chart page hit a snag',
  chartErrorBody: 'This chart cannot be shown right now — a network hiccup or a page load glitch. Retry, or go home and re-enter the birth data.',
  synTitle: 'Synastry',
  synEyebrow: 'SYNISTRY',
  synIntro:
    'Enter two people’s birth details (or pick them from your profiles) to compare the cross-flight of the Four Transformations (四化) and their Spouse Palaces (夫妻宫). The cross-flight lists deterministic chart facts only — no fortune or misfortune verdicts.',
  synEdit: 'Edit details',
  synPersonA: 'Person A',
  synPersonB: 'Person B',
  synCastFailed: () => 'Could not cast the chart.',
  synMingPalace: (stars, branch) => `命宫 (Life Palace): ${stars} (${branch})`,
  synSpousePalace: (stars, branch) => `夫妻宫 (Spouse Palace): ${stars} (${branch})`,
  synEmptyPalace: 'empty palace',
  synCrossTitle:
    '四化 (Four Transformations) cross-flight · where one person’s birth-year transformed stars land in the other’s chart',
  synSihuaRow: (label, star) => `化${label} (${SIHUA_EN[label] ?? label}) · ${star}`,
  synLandsIn: (palace) => `lands in ${palace}`,
  synNoStar: 'chart (the star is absent from the other chart)',
  synFooterLead:
    'The Four Transformations (四化) cross-flight is a deterministic chart fact — one person’s birth-year transformed star really does land in a palace of the other chart. A good-or-bad reading of the combined chart is outside the dataset’s coverage, so no verdict is offered here. For each person’s own detailed reading, see their own',
  synChartLink: 'chart conversation',
  synFooterTail: '. For cultural interest and study only.',
  formName: 'Name (optional)',
  formNamePlaceholderA: 'e.g. Alex',
  formNamePlaceholderB: 'e.g. Sam',
  formGender: 'Gender',
  formSelect: 'Select',
  formMale: 'Male',
  formFemale: 'Female',
  formBirthDate: 'Birth date (Gregorian)',
  formBirthHour: 'Birth hour (shichen 时辰)',
  formFromProfiles: 'From your profiles:',
  formSubmit: 'Compare charts',
  formNote:
    'Gender sets the direction of the 大限 (Decade Luck) and the birth hour fixes the entire chart, so neither is pre-filled — choose both for each person; all four fields for both people are needed to compare charts.',
  aboutTitle: 'About & methodology',
  aboutIntro:
    'Ziwei Assistant (紫微助手) casts a Gregorian birth date and hour into a twelve-palace (十二宫) Zi Wei Dou Shu chart, then retrieves the matching 13-dimension reading. Chart casting is a deterministic computation and the reading is a verbatim dataset lookup — neither step is reasoned out by a large model.',
  aboutSectionMethod: 'Chart-casting rules',
  aboutMethodHourLead: 'The shichen (时辰) is an index, not a clock time.',
  aboutMethodHourBody:
    'Shichen index 0–11 (Zi = 0, Chou = 1 … Hai = 11) — exactly the key format the reading dataset uses. The clock range behind each shichen:',
  aboutHourSep: '; ',
  aboutHourEnd: '.',
  aboutMethodDateLead: 'The date is the Gregorian casting date.',
  aboutMethodDateBody:
    'The chart is cast directly from the Gregorian year, month and day you enter. There is no lunar-conversion input and no apparent-solar-time correction — the dataset itself applies neither, so correcting here would push the lookup key out of sync with the chart.',
  aboutMethodLateZiLead: 'The late Zi hour casts on the next day.',
  aboutMethodLateZiBody:
    'If you were born between 23:00 and 23:59, the casting date rolls over to the next day while the shichen stays Zi (子, index 0). This rule is applied automatically when you enter a clock time; when you enter a shichen directly, you must pick “Zi of the same day” or “late Zi hour” yourself.',
  aboutMethodBirthplaceLead: 'Birthplace does not affect the chart.',
  aboutMethodBirthplaceBody:
    'This version does not collect a birthplace, and applies neither apparent-solar-time nor daylight-saving corrections.',
  aboutSectionLookup: 'How the reading is found',
  aboutLookupKeyLead: 'The lookup key is',
  aboutLookupKeyFormat: 'YYYY-MM-DD-shichenIndex-gender',
  aboutLookupKeyTail:
    ' — matched against the dataset character for character. A key hit returns that chart’s 13-dimension Markdown source text.',
  aboutLookupYearsLead: 'Years currently indexed in the sample library:',
  aboutLookupYearsNone: '(none)',
  aboutLookupYearsRange: (from, to, count) => `${from}–${to} (${count} years)`,
  aboutLookupRecords: (n) => `${n} records in total.`,
  aboutLookupMissing:
    'For a birth date that is not indexed — or whose key is missing — the page says “not covered by the sample library” instead of substituting any generated content.',
  aboutSectionDimensions: 'The thirteen reading dimensions',
  aboutDimensionsIntro:
    'Every chart reading contains exactly these thirteen dimensions, in this fixed order:',
  aboutSectionImpl: 'Implementation notes',
  aboutImplLayout:
    'The four-by-four grid layout of the twelve-palace board follows the structural ideas of the upstream MIT project’s `components/ChartBoard.tsx` and `components/PalaceCell.tsx`; the visuals and interactions were rewritten for this project. The reference code is kept under `vendor/upstream-reference/`, with its license in the same directory.',
  aboutImplMarkdown:
    'The readings are typeset by a lightweight Markdown renderer built into this project. It covers only the constructs that actually occur in the dataset (sub-headings, bold, italic, lists, quotes, rules) — no full Markdown dependency is pulled in.',
  aboutSectionCredits: 'Attribution & license',
  aboutCreditsNi:
    'Verbatim passages from Ni Haixia’s 《天纪》 (Tianji) fall outside the dataset’s CC BY 4.0 coverage and may not be used commercially in bulk; that material has been excluded from the dataset.',
  aboutCta: 'Cast a chart',
  palaceLabel: (name) => (PALACE_EN[name] ? `${name} (${PALACE_EN[name]})` : name),
  sihuaLabel: (label) => (SIHUA_EN[label] ? `${label} (${SIHUA_EN[label]})` : label),
  dimensionLabel: (key) => {
    const d = DIMENSION_TEXT[key];
    return d ? `${d.zh} (${d.en})` : key;
  },
  shichenLabel: (name) => (PINYIN[name] ? `${name} (${PINYIN[name]})` : name),
  branchLabel: (name) => (PINYIN[name] ? `${name} (${PINYIN[name]})` : name),
  starJoin: ', ',
  birthLine: (y, m, d, shichen) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}, ${shichen} hour`,
};

export const SITE_COPY: Record<Lang, SiteCopy> = { zh: ZH, en: EN };
