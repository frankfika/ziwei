/**
 * 排盘表单域的界面文案（中文 / English）—— 表单、时辰、星册、日期下拉、校验提示。
 *
 * 只管界面骨架：控件标签、按钮、提示、错误、占位符。
 * 命盘数据原文（解读正文、维度名、星曜名）不走这里。
 * 时辰 / 星曜是领域专名：中文原词保留，英文只加释义（子时 · Zi hour）。
 */

import type { Lang } from './quotaCopy';
import type { BirthErrorCode, Gender } from './birth';
import { GENDER_LABEL, GENDER_LABEL_EN } from './birth';

/** 英文月份缩写（日期下拉用） */
const MONTH_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const p2 = (n: number): string => String(n).padStart(2, '0');

export interface FormCopy {
  // ── 提交 ──────────────────────────────────────────────
  submit: string;
  submitting: string;
  /** 表单不完整时按钮上的字（默认） */
  disabledDefault: string;
  /** 缺年/月/日时按钮上的字 */
  disabledDate: (parts: string) => string;
  /** 日期非法（非空但无效）时按钮上的字 */
  disabledDateFix: string;
  /** 一切就绪时的提示 */
  hintOk: string;
  hintInvalidDate: string;
  /** 缺项提示（parts 已是本地化的「年、月、日」） */
  hintMissingParts: (parts: string) => string;
  // ── 字段 ──────────────────────────────────────────────
  nameLabel: string;
  namePlaceholder: string;
  dateLabel: string;
  /** 日期未填全时的行内报错 */
  dateIncomplete: string;
  /** 该年份暂无解读 */
  yearNotCovered: string;
  /** 缺项的名称（年 / 月 / 日） */
  partYear: string;
  partMonth: string;
  partDay: string;
  /** 缺项的名称（时辰） */
  partTime: string;
  /** 缺项列表的连接方式 */
  joinParts: (parts: string[]) => string;
  // ── 时辰 ──────────────────────────────────────────────
  timeLabel: string;
  modeShichen: string;
  modeClock: string;
  shichenAria: string;
  clockAria: string;
  /** 时辰下拉的占位项（未选时） */
  shichenPlaceholder: string;
  /** 时辰下拉项：中文原词 + 英文释义 + 钟点区间 */
  shichenOption: (zh: string, en: string, range: string) => string;
  /** 行内时辰名：中文原词 + 英文释义 */
  shichen: (zh: string, en: string) => string;
  ziQuestion: string;
  ziSame: string;
  ziSameHint: string;
  ziNext: string;
  ziNextHint: string;
  /** 排盘口径预览 */
  chartDate: (y: number, m: number, d: number, shichen: string) => string;
  chartDateLate: string;
  // ── 性别 ──────────────────────────────────────────────
  genderLabel: string;
  gender: Record<Gender, string>;
  // ── 星册 ──────────────────────────────────────────────
  libraryTitle: string;
  libraryCount: (n: number) => string;
  libraryNote: string;
  /** 存满时的补充说明（接在 libraryNote 后面） */
  libraryFull: (n: number) => string;
  libraryClear: string;
  libraryClearConfirm: string;
  libraryEmpty: string;
  librarySaved: (n: number) => string;
  collapse: string;
  expand: string;
  /** 档案行里的日期 */
  entryDate: (y: number, m: number, d: number) => string;
  /** 档案行里的时辰 */
  entryTimeShichen: (zh: string, en: string) => string;
  fillBack: (label: string) => string;
  fillBackTitle: string;
  fillBackGlyph: string;
  /** 档案行上的「命盘」直达链接 */
  viewChart: string;
  viewChartTitle: string;
  rename: (label: string) => string;
  renameTitle: string;
  renameGlyph: string;
  remove: (label: string) => string;
  removeTitle: string;
  removeGlyph: string;
  renamePrompt: string;
  /** 回填成功的浮层提示 */
  filledBack: (label: string) => string;
  /** 表单已有内容、回填将覆盖时的确认 */
  overwriteConfirm: string;
  // ── 日期下拉 ──────────────────────────────────────────
  ariaYear: string;
  ariaMonth: string;
  ariaDay: string;
  optionYear: string;
  optionMonth: string;
  optionDay: string;
  /** 换月后「日」被清掉时的就地提示 */
  dayCleared: (month: number, maxDay: number) => string;
  yearOption: (y: number) => string;
  monthOption: (m: number) => string;
  dayOption: (d: number) => string;
  // ── 校验错误（文案与 lib/birth.ts 的 errorCode 一一对应）────────
  errors: Record<BirthErrorCode, (arg?: string) => string>;
  // ── 页面 ──────────────────────────────────────────────
  pageTitle: string;
  backLink: string;
}

const ZH: FormCopy = {
  submit: '排 盘',
  submitting: '排盘中…',
  disabledDefault: '请先填完整生辰',
  disabledDate: (parts) => `请先选择${parts}`,
  disabledDateFix: '请修正出生日期',
  hintOk: '提交后生成你的命盘与解读。',
  hintInvalidDate: '请先填写有效的出生日期。',
  hintMissingParts: (parts) => `请先选择出生${parts}，再排盘。`,
  nameLabel: '姓名（可选）',
  namePlaceholder: '仅用于显示，不影响排盘',
  dateLabel: '出生日期（公历）',
  dateIncomplete: '请选择完整的公历出生日期。',
  yearNotCovered: '这一年暂时没有解读 —— 仍可排盘看十二宫。',
  partYear: '年',
  partMonth: '月',
  partDay: '日',
  partTime: '时辰',
  joinParts: (parts) => parts.join('、'),
  timeLabel: '出生时辰',
  modeShichen: '按时辰',
  modeClock: '按钟点',
  shichenAria: '时辰',
  clockAria: '出生钟点',
  shichenPlaceholder: '请选择时辰',
  shichenOption: (zh, _en, range) => `${zh}时（${range}）`,
  shichen: (zh, _en) => `${zh}时`,
  ziQuestion: '子时跨零点，你出生在哪一段？',
  ziSame: '当日子时',
  ziSameHint: '00:00–00:59',
  ziNext: '晚子时',
  ziNextHint: '23:00–23:59 · 按次日排盘',
  chartDate: (y, m, d, shichen) => `将按 ${y} 年 ${m} 月 ${d} 日 ${shichen} 排盘`,
  chartDateLate: '（晚子时，已顺延到次日）',
  genderLabel: '性别',
  gender: { male: GENDER_LABEL.male, female: GENDER_LABEL.female },
  libraryTitle: '星册',
  libraryCount: (n) => `${n} 张`,
  libraryNote: '只存在本机，不上传。',
  libraryFull: (n) => ` 最多存 ${n} 张，新存的会挤掉最早的一张。`,
  libraryClear: '清空',
  libraryClearConfirm: '清空全部已存命盘？',
  libraryEmpty: '排过的盘会留在这',
  librarySaved: (n) => `已存 ${n} 张`,
  collapse: '收起',
  expand: '展开',
  entryDate: (y, m, d) => `${y}年${m}月${d}日`,
  entryTimeShichen: (zh, _en) => `${zh}时`,
  fillBack: (label) => `回填「${label}」到表单`,
  fillBackTitle: '回填到表单修改',
  fillBackGlyph: '填',
  viewChart: '命盘',
  viewChartTitle: '直接查看这张命盘',
  rename: (label) => `重命名「${label}」`,
  renameTitle: '重命名',
  renameGlyph: '名',
  remove: (label) => `删除「${label}」`,
  removeTitle: '删除',
  removeGlyph: '×',
  renamePrompt: '给这张盘起个名字（如「妈妈的盘」）',
  filledBack: (label) => `已载入「${label}」，可修改后重新排盘`,
  overwriteConfirm: '表单里已有填写内容，载入这张盘会覆盖，继续？',
  ariaYear: '出生年份',
  ariaMonth: '出生月份',
  ariaDay: '出生日期',
  optionYear: '年',
  optionMonth: '月',
  optionDay: '日',
  dayCleared: (month, maxDay) => `${month} 月只有 ${maxDay} 天，「日」已清掉，请重新选择。`,
  yearOption: (y) => `${y}年`,
  monthOption: (m) => `${m}月`,
  dayOption: (d) => `${d}日`,
  errors: {
    'missing-date': () => '请填写完整的出生日期',
    'year-range': () => '出生年份需在 1900–2100 之间',
    'month-range': () => '出生月份需在 1–12 之间',
    'day-range': () => '出生日期需在 1–31 之间',
    'invalid-date': (date) => `该日期不存在：${date}`,
    'invalid-clock': () => '钟点需在 00:00–23:59 之间',
    'invalid-shichen': () => '时辰需在 0–11 之间',
    'missing-shichen': () => '请选择出生时辰',
  },
  pageTitle: '排一张新盘',
  backLink: '← 回到命盘对话',
};

const EN: FormCopy = {
  submit: 'Cast chart',
  submitting: 'Casting…',
  disabledDefault: 'Fill in the full birth details',
  disabledDate: (parts) => `Fill in ${parts}`,
  disabledDateFix: 'Fix the date of birth',
  hintOk: 'Submitting generates your chart and reading.',
  hintInvalidDate: 'Please enter a valid date of birth.',
  hintMissingParts: (parts) => `Fill in your ${parts} first, then cast the chart.`,
  nameLabel: 'Name (optional)',
  namePlaceholder: 'For display only — it does not affect the chart',
  dateLabel: 'Date of birth (Gregorian)',
  dateIncomplete: 'Please pick a complete Gregorian date of birth.',
  yearNotCovered: 'There is no reading for this year yet — you can still cast the chart and see the twelve palaces.',
  partYear: 'year',
  partMonth: 'month',
  partDay: 'day',
  partTime: 'double-hour',
  joinParts: (parts) => parts.join(', '),
  timeLabel: 'Time of birth',
  modeShichen: 'By double-hour',
  modeClock: 'By clock time',
  shichenAria: 'Double-hour',
  clockAria: 'Time of birth',
  shichenPlaceholder: 'Select the double-hour',
  shichenOption: (zh, en, range) => `${zh}时 · ${en} (${range})`,
  shichen: (zh, en) => `${zh}时 · ${en}`,
  ziQuestion: 'The Zi hour crosses midnight — which part were you born in?',
  ziSame: 'Zi hour, same day',
  ziSameHint: '00:00–00:59',
  ziNext: 'Late Zi hour',
  ziNextHint: '23:00–23:59 · charted as the next day',
  chartDate: (y, m, d, shichen) => `Chart date: ${y}-${p2(m)}-${p2(d)}, ${shichen}`,
  chartDateLate: ' (late Zi hour — rolled over to the next day)',
  genderLabel: 'Gender',
  gender: { male: GENDER_LABEL_EN.male, female: GENDER_LABEL_EN.female },
  libraryTitle: 'Chart library',
  libraryCount: (n) => `${n} saved`,
  libraryNote: 'Kept on this device only — never uploaded.',
  libraryFull: (n) => ` At most ${n} charts are kept; adding a new one drops the oldest.`,
  libraryClear: 'Clear',
  libraryClearConfirm: 'Clear all saved charts?',
  libraryEmpty: 'Charts you cast will show up here',
  librarySaved: (n) => `Saved ${n}`,
  collapse: 'Collapse',
  expand: 'Expand',
  entryDate: (y, m, d) => `${y}-${p2(m)}-${p2(d)}`,
  entryTimeShichen: (zh, en) => `${zh}时 · ${en}`,
  fillBack: (label) => `Load “${label}” back into the form`,
  fillBackTitle: 'Load into the form to edit',
  fillBackGlyph: 'Fill',
  viewChart: 'Chart',
  viewChartTitle: 'Open this chart directly',
  rename: (label) => `Rename “${label}”`,
  renameTitle: 'Rename',
  renameGlyph: 'Edit',
  remove: (label) => `Delete “${label}”`,
  removeTitle: 'Delete',
  removeGlyph: '×',
  renamePrompt: 'Name this chart (e.g. “Mom’s chart”)',
  filledBack: (label) => `Loaded “${label}” — edit it and cast again`,
  overwriteConfirm: 'The form has input already — loading this chart will overwrite it. Continue?',
  ariaYear: 'Birth year',
  ariaMonth: 'Birth month',
  ariaDay: 'Birth day',
  optionYear: 'Year',
  optionMonth: 'Month',
  optionDay: 'Day',
  dayCleared: (month, maxDay) => `${MONTH_EN[month - 1] ?? month} has only ${maxDay} days — the day was cleared, please pick again.`,
  yearOption: (y) => `${y}`,
  monthOption: (m) => MONTH_EN[m - 1] ?? `${m}`,
  dayOption: (d) => `${d}`,
  errors: {
    'missing-date': () => 'Please fill in the full date of birth',
    'year-range': () => 'Birth year must be between 1900 and 2100',
    'month-range': () => 'Birth month must be between 1 and 12',
    'day-range': () => 'Birth day must be between 1 and 31',
    'invalid-date': (date) => `That date does not exist: ${date}`,
    'invalid-clock': () => 'Time must be between 00:00 and 23:59',
    'invalid-shichen': () => 'Double-hour must be between 0 and 11',
    'missing-shichen': () => 'Please select the double-hour of birth',
  },
  pageTitle: 'Cast a new chart',
  backLink: '← Back to the chart chat',
};

export const FORM_COPY: Record<Lang, FormCopy> = { zh: ZH, en: EN };
