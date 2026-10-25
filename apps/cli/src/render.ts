/**
 * 展示层：把 `ChartJSON` / `ReadingLookup` 渲染成终端文本。
 *
 * 这里只做「排版」，不做任何命理判断：
 * 星曜、宫位、四化、大限全部来自引擎；断语全部来自数据集检索结果。
 */

import {
  DIMENSION_LABELS,
  type ChartJSON,
  type ReadingDimension,
  type ReadingLookup,
} from '@ziwei/core';
import { HOUR_BRANCHES, type ChartPalace } from '@ziwei/chart-engine';
import { ATTRIBUTION, DISCLAIMER } from './attribution';
import type { ClockConversion } from './args';
import { ganZhi, lunarDayName, lunarMonthName } from './lunar';
import { padEnd } from './text';
import type { Theme } from './theme';

/** 默认每维预览字数 */
export const PREVIEW_CHARS = 200;

const RULE_WIDTH = 58;

/** 中文性别 */
function genderText(g: 'male' | 'female'): string {
  return g === 'male' ? '男' : '女';
}

/** 截断预览：尽量切在句末标点处，避免断在半句；总长（含省略号）不超过 limit */
export function previewText(text: string, limit = PREVIEW_CHARS): string {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit - 1);
  const breaks = '。！？；\n';
  let cut = slice.length;
  for (let i = slice.length - 1; i >= Math.floor(limit * 0.5); i--) {
    if (breaks.includes(slice[i]!)) {
      cut = i + 1;
      break;
    }
  }
  // 数据集里有 4 字节 emoji（如 🟡），按 UTF-16 码元切分可能劈开代理对，回退一格
  const last = slice.charCodeAt(cut - 1);
  if (cut > 0 && last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return slice.slice(0, cut) + '…';
}

/** 星曜标签：名称(亮度)[四化] */
function starLabel(palace: ChartPalace, name: string): string {
  const star = palace.stars.find((s) => s.name === name);
  if (!star) return name;
  const brightness = star.brightnessRaw ? `(${star.brightnessRaw})` : '';
  const siHua = star.siHua ? `[${star.siHua}]` : '';
  return `${name}${brightness}${siHua}`;
}

/** 一宫的主星文本 */
function palaceStars(palace: ChartPalace): string {
  if (palace.majorStars.length > 0) {
    return palace.majorStars.map((n) => starLabel(palace, n)).join('、');
  }
  if (palace.isEmpty) {
    const from = palace.borrowedFromName ? `借${palace.borrowedFromName}` : '空宫';
    const borrowed = palace.borrowedStars?.length
      ? `：${palace.borrowedStars.join('、')}`
      : '';
    return `${from}${borrowed}`;
  }
  return '无主星';
}

/**
 * 宫名。
 * 引擎给的是「兄弟 / 财帛」这类两字名，适配器层已统一补成「兄弟宫 / 财帛宫」，
 * 这里直接用即可（不要再补，否则会变成「财帛宫宫」）。
 */
function palaceName(palace: ChartPalace): string {
  return palace.name;
}

/** 宫干自化文本 */
function selfSihuaText(palace: ChartPalace): string {
  if (!palace.selfSihua?.length) return '';
  return ` 自化 ${palace.selfSihua.map((s) => `${s.siHua}·${s.starName}`).join(' ')}`;
}

export interface ChartRenderOptions {
  theme: Theme;
  conversion?: ClockConversion;
}

/** 渲染命盘摘要 */
export function renderChart(c: ChartJSON, opts: ChartRenderOptions): string[] {
  const t = opts.theme;
  const lines: string[] = [];
  const b = c.birth;

  const title = b.name ? `紫微命盘 · ${b.name}` : '紫微命盘';
  lines.push(t.bold(title));
  lines.push(t.dim('═'.repeat(RULE_WIDTH)));

  if (opts.conversion) {
    const conv = opts.conversion;
    const msg = conv.lateZi
      ? `晚子时按次日排盘：排盘日 ${conv.inputDate} → ${conv.chartDate}`
      : `排盘日 ${conv.chartDate}`;
    lines.push(
      t.yellow(`⏱  钟点换算：${conv.clock} → ${conv.hourBranch}时（时辰序号 ${conv.hourIndex}）；${msg}`),
    );
    lines.push('');
  }

  const row = (k: string, v: string) => lines.push(t.dim(padEnd(k, 10)) + '  ' + v);

  const branch = HOUR_BRANCHES[b.hour] ?? '?';
  row('生辰', `${b.year}年${b.month}月${b.day}日 ${branch}时（时辰序号 ${b.hour}） ${genderText(b.gender)}`);
  row(
    '农历',
    `${ganZhi(c.lunar.yearStem, c.lunar.yearBranch)}年 ` +
      `${lunarMonthName(c.lunar.lunarMonth, c.lunar.isLeapMonth)}${lunarDayName(c.lunar.lunarDay)}`,
  );
  if (c.lunar.fourPillars) {
    const [y, mo, d, h] = c.lunar.fourPillars;
    row('四柱', `年 ${y} · 月 ${mo} · 日 ${d} · 时 ${h}`);
  }

  const mingPalace = c.palaces.find((p) => p.branch === c.mingGongBranch);
  const shenPalace = c.palaces.find((p) => p.branch === c.shenGongBranch);
  row('命宫', mingPalace ? `${mingPalace.branchName}宫（${mingPalace.stemName}）` : '—');
  row('身宫', shenPalace ? `${shenPalace.branchName}宫（${shenPalace.stemName}）` : '—');
  row('五行局', c.wuxingJuName);
  row('命主', c.mingZhu ?? '—');
  row('身主', c.shenZhu ?? '—');
  row('阴阳男女', c.yinYangGender ?? '—');
  row('当前年龄', `${c.currentAge} 岁`);

  lines.push('');
  lines.push(t.bold('十二宫（地支子 → 亥）'));
  const palaces = [...c.palaces].sort((a, b2) => a.branch - b2.branch);
  for (const p of palaces) {
    const markers = p.isShenGong ? '身宫' : '';
    const stars = palaceStars(p) + selfSihuaText(p);
    const age = p.daXianAge ? `${p.daXianAge[0]}-${p.daXianAge[1]}` : '—';
    const current = p.isCurrentDaXian ? t.green('  ← 当前大限') : '';
    const name = palaceName(p);
    const nameCell = p.isMingGong ? t.bold(padEnd(name, 6)) : padEnd(name, 6);
    lines.push(
      '  ' +
        padEnd(p.branchName, 2) +
        '  ' +
        nameCell +
        ' ' +
        padEnd(markers, 4) +
        ' ' +
        padEnd(p.stemName, 2) +
        '  ' +
        padEnd(stars, 26) +
        '大限 ' +
        age +
        current,
    );
  }

  const currentPalace = c.palaces.find((p) => p.isCurrentDaXian);
  lines.push('');
  if (currentPalace) {
    const age = currentPalace.daXianAge;
    lines.push(
      t.dim(padEnd('当前大限', 10)) +
        '  ' +
        t.green(
          `${palaceName(currentPalace)}（${currentPalace.branchName}）` +
            (age ? ` ${age[0]}-${age[1]} 岁` : ''),
        ) +
        `   当前年龄 ${c.currentAge} 岁`,
    );
  } else {
    lines.push(t.dim(padEnd('当前大限', 10)) + '  ' + '—');
  }

  return lines;
}

export interface ReadingRenderOptions {
  theme: Theme;
  /** 打印全文 */
  full: boolean;
  /** 只看某一维 */
  dim?: ReadingDimension;
}

/** 渲染 13 维解读 */
export function renderReading(
  reading: Extract<ReadingLookup, { status: 'ok' }>,
  opts: ReadingRenderOptions,
): string[] {
  const t = opts.theme;
  const lines: string[] = [];

  if (opts.dim) {
    const entry = reading.dimensions.find((d) => d.key === opts.dim);
    lines.push(t.dim('─'.repeat(RULE_WIDTH)));
    if (!entry) {
      lines.push(t.yellow(`样本库中没有「${opts.dim}」这一维的解读。`));
      return lines;
    }
    lines.push(t.bold(`单维解读 · ${entry.label} (${entry.key}) · ${entry.chars} 字`));
    lines.push(entry.text);
    return lines;
  }

  lines.push(t.dim('─'.repeat(RULE_WIDTH)));
  lines.push(t.bold(`13 维解读 · 合计 ${reading.totalChars} 字`));
  if (!opts.full) {
    lines.push(
      t.dim(
        `（以下每维显示前 ${PREVIEW_CHARS} 字；加 --full 打印全文，或用 --dim <维度> 打印单维全文）`,
      ),
    );
  }
  lines.push('');

  reading.dimensions.forEach((d, i) => {
    const idx = `${i + 1}/${reading.dimensions.length}`;
    lines.push(t.bold(`【${idx}】${d.label} (${d.key}) · ${d.chars} 字`));
    lines.push(opts.full ? d.text : previewText(d.text));
    lines.push('');
  });

  return lines;
}

/** 渲染「样本库未覆盖」 */
export function renderNotCovered(
  reading: Extract<ReadingLookup, { status: 'not-covered' }>,
  opts: { theme: Theme },
): string[] {
  const t = opts.theme;
  return [
    t.dim('─'.repeat(RULE_WIDTH)),
    t.bold(t.yellow('样本库未覆盖')),
    '',
    reading.message,
  ];
}

/** 渲染覆盖情况 */
export function renderCoverage(
  coverage: { years: number[]; indexedYears: number[]; totalRecords: number; dataDir: string },
  opts: { theme: Theme },
): string[] {
  const t = opts.theme;
  const years = coverage.indexedYears.length ? coverage.indexedYears : coverage.years;
  const lines: string[] = [];
  lines.push(t.bold('样本库覆盖情况'));
  lines.push(t.dim('═'.repeat(RULE_WIDTH)));
  lines.push(t.dim(padEnd('已覆盖年份', 12)) + '  ' + (years.length ? years.join(' / ') : '（无）'));
  lines.push(t.dim(padEnd('记录总数', 12)) + '  ' + String(coverage.totalRecords));
  lines.push(t.dim(padEnd('数据目录', 12)) + '  ' + coverage.dataDir);
  return lines;
}

/** 署名 + 免责声明（所有输出的末尾） */
export function renderFooter(opts: { theme: Theme }): string[] {
  const t = opts.theme;
  return [
    '',
    t.dim('─'.repeat(RULE_WIDTH)),
    t.dim(ATTRIBUTION),
    '',
    t.dim(DISCLAIMER),
  ];
}
