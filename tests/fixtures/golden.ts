/**
 * 金标准盘（golden chart）的定义、规范化与快照读写。
 *
 * ── 为什么要有金标准 ─────────────────────────────────────────────
 * 紫微助手最大的风险不是「算错」，而是「**静默地算错**」：
 * 引擎升个版本、某天改一行安星代码、依赖换一版，用户看到的盘就变了，
 * 但没有任何人收到通知。金标准快照就是那个通知。
 *
 * ── 快照里放什么 / 不放什么 ─────────────────────────────────────
 * 放：命宫·身宫地支、五行局、命主身主、十二宫宫名 + 每颗星的四化与亮度、
 *     大限、命宫第一主星。
 * 不放：**随时间变化的字段**（`currentAge`、`palaces[].isCurrentDaXian`）。
 *     这两个字段由 iztro 按「今天」算，放进快照会让快照每天自己过期。
 *
 * ── 快照文件在哪 ────────────────────────────────────────────────
 * `tests/golden/<id>.json`，**必须进 git** —— 它是回归基线，不是构建产物。
 * 数据集（56GB）才不进 git；金标准只依赖排盘引擎，所以 CI 没有数据也能跑。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import { chart, type Birth, type ChartJSON } from '@ziwei/chart-engine';

/** tests/ 目录 */
export const TESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 金标准快照目录（进 git） */
export const GOLDEN_DIR = path.join(TESTS_DIR, 'golden');

/** 仓库根目录 */
export const REPO_ROOT = path.resolve(TESTS_DIR, '..');

/** 一条金标准用例 */
export interface GoldenCase {
  /** 用例 id，同时是快照文件名（不含 .json） */
  id: string;
  /** 中文说明：这个盘代表什么 */
  label: string;
  /** 覆盖了哪些边界点（写进快照文件，方便 review 时一眼看懂） */
  covers: string[];
  /** 生辰（hour 是时辰序号 0–11，不是钟点） */
  birth: Birth;
  /**
   * 对应的农历日期（可选）。
   *
   * 闰月用例必须写：测试会拿引擎自己的农历换算反查一遍，
   * 确认「这条确实是农历闰月 X 月 Y 日」，防止用例列表写错日期还照样绿。
   */
  lunarRef?: { year: number; month: number; day: number; isLeapMonth: boolean };
}

/**
 * 金标准用例清单（9 条）。
 *
 * 选点依据 —— 每一条都钉住一类「静默改动」高发区：
 *  · 时辰边界：子(0) / 丑(1) / 辰(4) / 亥(11) —— 时辰序号算错一位，整张盘错。
 *  · 闰月生日：农历闰月 → 公历某天，闰月归属（归本月 / 归下月 / 月中分界）最容易被人改。
 *  · 闰年 2 月 29 日：日历边界。
 *  · 年末跨年 12-31：跨年 + 跨大限边界。
 *  · 年份边界 1950 / 2026：数据集覆盖范围的首尾（1950–2026）。
 *  · 男女各若干：阴阳男女影响大限顺逆。
 */
export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: '1950-01-01-h00-male',
    label: '数据集最早年 1950 · 子时 · 男',
    covers: ['数据集最早年边界(1950)', '时辰边界·子时(0)', '性别·男'],
    birth: { year: 1950, month: 1, day: 1, hour: 0, gender: 'male' },
  },
  {
    id: '1990-03-15-h01-male',
    label: '丑时 · 男',
    covers: ['时辰边界·丑时(1)', '性别·男'],
    birth: { year: 1990, month: 3, day: 15, hour: 1, gender: 'male' },
  },
  {
    id: '1990-06-25-h05-male',
    label: '农历闰五月初三（公历 1990-06-25）· 巳时 · 男',
    covers: ['闰月生日·1990 闰五月', '时辰·巳时(5)', '性别·男'],
    birth: { year: 1990, month: 6, day: 25, hour: 5, gender: 'male' },
    lunarRef: { year: 1990, month: 5, day: 3, isLeapMonth: true },
  },
  {
    id: '1990-12-31-h03-female',
    label: '年末 12-31 · 卯时 · 女',
    covers: ['年末跨年', '时辰·卯时(3)', '性别·女'],
    birth: { year: 1990, month: 12, day: 31, hour: 3, gender: 'female' },
  },
  {
    id: '2000-02-29-h06-male',
    label: '闰年 2 月 29 日 · 午时 · 男',
    covers: ['闰年 2 月 29 日', '时辰·午时(6)', '性别·男'],
    birth: { year: 2000, month: 2, day: 29, hour: 6, gender: 'male' },
  },
  {
    id: '2000-03-15-h11-female',
    label: '亥时 · 女',
    covers: ['时辰边界·亥时(11)', '性别·女'],
    birth: { year: 2000, month: 3, day: 15, hour: 11, gender: 'female' },
  },
  {
    id: '2020-05-30-h07-female',
    label: '农历闰四月初八（公历 2020-05-30）· 未时 · 女',
    covers: ['闰月生日·2020 闰四月', '时辰·未时(7)', '性别·女'],
    birth: { year: 2020, month: 5, day: 30, hour: 7, gender: 'female' },
    lunarRef: { year: 2020, month: 4, day: 8, isLeapMonth: true },
  },
  {
    id: '2020-06-07-h04-male',
    label: '农历闰四月十六（公历 2020-06-07）· 月中分界 · 辰时 · 男',
    covers: ['闰月归属切分边界·闰四月十六(归下月)', '时辰·辰时(4)', '性别·男'],
    birth: { year: 2020, month: 6, day: 7, hour: 4, gender: 'male' },
    lunarRef: { year: 2020, month: 4, day: 16, isLeapMonth: true },
  },
  {
    id: '2026-12-31-h11-female',
    label: '数据集最新年 2026 · 年末 12-31 · 亥时 · 女',
    covers: ['数据集最新年边界(2026)', '年末跨年', '时辰·亥时(11)', '性别·女'],
    birth: { year: 2026, month: 12, day: 31, hour: 11, gender: 'female' },
  },
];

/** 快照里的一颗星 */
export interface StarSnapshot {
  name: string;
  type: string;
  /** 四化：禄 / 权 / 科 / 忌 */
  siHua?: string;
  /** 紫微斗数标准 8 档亮度（展示层用） */
  brightnessRaw?: string;
}

/** 快照里的一个宫 */
export interface PalaceSnapshot {
  branch: number;
  branchName: string;
  stem: number;
  stemName: string;
  name: string;
  isMingGong: boolean;
  isShenGong: boolean;
  isEmpty: boolean;
  borrowedFromBranch?: number;
  borrowedFromName?: string;
  borrowedStars?: string[];
  selfSihua?: Array<{ siHua: string; starName: string }>;
  /** 大限年龄区间（静态，不随当前时间变） */
  daXianAge?: [number, number];
  stars: StarSnapshot[];
  majorStars: string[];
}

/** 快照里的大限 */
export interface DaXianSnapshot {
  startAge: number;
  endAge: number;
  palaceBranch: number;
  palaceName: string;
  stemIndex?: number;
  stemName?: string;
  siHua?: { lu: string; quan: string; ke: string; ji: string };
}

/** 一张盘的规范化快照 */
export interface ChartSnapshot {
  /** 命宫地支索引 0–11 */
  mingGongBranch: number;
  mingGongBranchName: string;
  /** 身宫地支索引 0–11 */
  shenGongBranch: number;
  shenGongBranchName: string;
  /** 五行局，如 4 */
  wuxingJu: number;
  /** 五行局名，如「木三局」 */
  wuxingJuName: string;
  /** 紫微星所在地支索引 */
  ziweiPos: number;
  /** 命主星 */
  mingZhu?: string;
  /** 身主星 */
  shenZhu?: string;
  /** 阳男 / 阴男 / 阳女 / 阴女 */
  yinYangGender?: string;
  /** 命宫第一主星（数据集 `ms` 字段同口径，键口径校验也用它当指纹） */
  mingGongFirstMajorStar: string | null;
  /** 农历（引擎归一化后的口径） */
  lunar: {
    lunarYear: number;
    lunarMonth: number;
    lunarDay: number;
    yearStem: number;
    yearBranch: number;
    isLeapMonth: boolean;
    fourPillars?: string[];
    fourPillarsLunar?: string[];
  };
  /** 十二宫，按地支 0–11 排序 */
  palaces: PalaceSnapshot[];
  /** 大限，12 条 */
  daXians: DaXianSnapshot[];
}

/** 把 ChartJSON 规范化成快照（剔除随时间变化的字段） */
export function normalizeChart(c: ChartJSON): ChartSnapshot {
  // ★ 按地支 0–11 升序**规范化**：引擎数组顺序变了（传统盘面序 ↔ branch 升序）
  //   也不该误报回归 —— 快照比较的是「哪个地支的宫有什么星」，
  //   不是「数组第几项是什么」。这样以后再调顺序不会平白炸一次。
  const palaces: PalaceSnapshot[] = [...c.palaces]
    .sort((a, b) => a.branch - b.branch)
    .map((p) => {
    const snap: PalaceSnapshot = {
      branch: p.branch,
      branchName: p.branchName,
      stem: p.stem,
      stemName: p.stemName,
      name: p.name,
      isMingGong: p.isMingGong,
      isShenGong: p.isShenGong,
      isEmpty: p.isEmpty,
      stars: p.stars.map((s) => {
        const star: StarSnapshot = { name: s.name, type: s.type };
        if (s.siHua) star.siHua = s.siHua;
        if (s.brightnessRaw) star.brightnessRaw = s.brightnessRaw;
        return star;
      }),
      majorStars: [...p.majorStars],
    };
    if (p.borrowedFromBranch !== undefined) snap.borrowedFromBranch = p.borrowedFromBranch;
    if (p.borrowedFromName) snap.borrowedFromName = p.borrowedFromName;
    if (p.borrowedStars) snap.borrowedStars = [...p.borrowedStars];
    if (p.selfSihua) snap.selfSihua = p.selfSihua.map((s) => ({ siHua: s.siHua, starName: s.starName }));
    if (p.daXianAge) snap.daXianAge = [p.daXianAge[0], p.daXianAge[1]];
    return snap;
  });

  const mingPalace = c.palaces.find((p) => p.isMingGong);
  const shenPalace = c.palaces.find((p) => p.isShenGong);

  const lunar: ChartSnapshot['lunar'] = {
    lunarYear: c.lunar.lunarYear,
    lunarMonth: c.lunar.lunarMonth,
    lunarDay: c.lunar.lunarDay,
    yearStem: c.lunar.yearStem,
    yearBranch: c.lunar.yearBranch,
    isLeapMonth: c.lunar.isLeapMonth,
  };
  if (c.lunar.fourPillars) lunar.fourPillars = [...c.lunar.fourPillars];
  if (c.lunar.fourPillarsLunar) lunar.fourPillarsLunar = [...c.lunar.fourPillarsLunar];

  const snapshot: ChartSnapshot = {
    mingGongBranch: c.mingGongBranch,
    mingGongBranchName: mingPalace?.branchName ?? '',
    shenGongBranch: c.shenGongBranch,
    shenGongBranchName: shenPalace?.branchName ?? '',
    wuxingJu: c.wuxingJu,
    wuxingJuName: c.wuxingJuName,
    ziweiPos: c.ziweiPos,
    mingGongFirstMajorStar: mingPalace?.majorStars[0] ?? null,
    lunar,
    palaces,
    daXians: [...c.daXians]
      .sort((a, b) => a.palaceBranch - b.palaceBranch)
      .map((d) => {
        const item: DaXianSnapshot = {
          startAge: d.startAge,
          endAge: d.endAge,
          palaceBranch: d.palaceBranch,
          palaceName: d.palaceName,
        };
        if (d.stemIndex !== undefined) item.stemIndex = d.stemIndex;
        if (d.stemName) item.stemName = d.stemName;
        if (d.siHua) item.siHua = { ...d.siHua };
        return item;
      }),
  };
  if (c.mingZhu) snapshot.mingZhu = c.mingZhu;
  if (c.shenZhu) snapshot.shenZhu = c.shenZhu;
  if (c.yinYangGender) snapshot.yinYangGender = c.yinYangGender;

  return snapshot;
}

/** 算某条金标准用例的快照 */
export function snapshotFor(c: GoldenCase): ChartSnapshot {
  return normalizeChart(chart(c.birth));
}

/** 读排盘引擎包版本（写进快照元信息） */
function engineVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'packages/chart-engine/package.json'), 'utf8'),
    ) as { name?: string; version?: string };
    return `${pkg.name ?? '@ziwei/chart-engine'}@${pkg.version ?? 'unknown'}`;
  } catch {
    return '@ziwei/chart-engine@unknown';
  }
}

/** 快照文件的元信息（说明这份基线是怎么来的） */
export interface GoldenMeta {
  /** 快照格式版本 */
  schema: string;
  /** 生成命令 */
  generatedBy: string;
  /** 引擎来源 */
  engine: string;
  /** 引擎包版本 */
  engineVersion: string;
  /** 数据集来源（键口径与 ms 指纹依赖它） */
  dataset: string;
  /** 快照刻意排除的随时间变化字段 */
  excludedTimeVaryingFields: string[];
  /** 快照的规范化规则（决定了什么算「变了」、什么不算） */
  normalization: string[];
  /** 提醒：改引擎后如何更新 */
  howToRefresh: string;
}

/** 生成快照文件里的 meta */
export function goldenMeta(): GoldenMeta {
  return {
    schema: 'ziwei-golden-chart/v1',
    generatedBy: 'tests/golden.test.ts（环境变量 ZIWEI_UPDATE_GOLDEN=1 时重写）',
    engine:
      '@ziwei/chart-engine —— 排盘引擎源码 vendored 自 https://github.com/Renhuai123/ziwei-doushu ' +
      '（MIT，作者：王多鱼AI），位于 packages/chart-engine/src/engine',
    engineVersion: engineVersion(),
    dataset:
      '紫微斗数开源解读数据集 v4.0-13d（674,976 张命盘 × 13 维，CC BY 4.0，须署名）—— ' +
      '来源 https://github.com/Renhuai123/ziwei-doushu',
    excludedTimeVaryingFields: ['currentAge', 'palaces[].isCurrentDaXian'],
    normalization: [
      'palaces 按 branch 0–11 升序存放（引擎数组顺序变化不算回归）',
      'daXians 按 palaceBranch 升序存放',
      '宫名 / 大限宫名按引擎当前输出原样记录（含「宫」字后缀），改名会如实报出来',
      '每颗星记录 name / type / siHua / brightness / brightnessRaw',
    ],
    howToRefresh:
      '确认盘面变化是**有意为之**后，在仓库根执行：' +
      'ZIWEI_UPDATE_GOLDEN=1 npx tsx tests/golden.test.ts，' +
      '然后 review git diff 再提交。本文件是回归基线，不要手改。',
  };
}

/** 快照文件（磁盘上的完整 JSON 文档） */
export interface GoldenFile {
  meta: GoldenMeta;
  id: string;
  label: string;
  covers: string[];
  birth: Birth;
  snapshot: ChartSnapshot;
}

/** 组装一份快照文件内容 */
export function buildGoldenFile(c: GoldenCase, snapshot: ChartSnapshot): GoldenFile {
  return {
    meta: goldenMeta(),
    id: c.id,
    label: c.label,
    covers: [...c.covers],
    birth: { ...c.birth },
    snapshot,
  };
}

/** 快照文件路径 */
export function goldenFilePath(id: string): string {
  return path.join(GOLDEN_DIR, `${id}.json`);
}

/** 读快照文件；不存在返回 null */
export function readGoldenFile(id: string): GoldenFile | null {
  const p = goldenFilePath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8')) as GoldenFile;
}

/** 写快照文件（稳定缩进 + 末尾换行，保证 git diff 干净） */
export function writeGoldenFile(file: GoldenFile): string {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  const p = goldenFilePath(file.id);
  fs.writeFileSync(p, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  return p;
}

/** 一处字段差异 */
export interface FieldDiff {
  /** 字段路径，如 `palaces[3].stars[0].siHua` */
  path: string;
  /** 快照里的值 */
  expected: unknown;
  /** 重算出来的值 */
  actual: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 深度比对两份快照，列出**每一个**变化的字段。
 *
 * 失败信息必须精确到字段 —— 「盘不一样了」没用，
 * 「palaces[3] 命宫主星从紫微变成天府」才有用。
 */
export function diffSnapshot(expected: unknown, actual: unknown, path = '$'): FieldDiff[] {
  if (isDeepStrictEqual(expected, actual)) return [];

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    const out: FieldDiff[] = [];
    for (const k of keys) {
      const child = `${path}.${k}`;
      if (!(k in expected)) {
        out.push({ path: child, expected: '<快照里没有这个字段>', actual: actual[k] });
        continue;
      }
      if (!(k in actual)) {
        out.push({ path: child, expected: expected[k], actual: '<重算结果里没有这个字段>' });
        continue;
      }
      out.push(...diffSnapshot(expected[k], actual[k], child));
    }
    return out;
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      return [{ path: `${path}.length`, expected: expected.length, actual: actual.length }];
    }
    const out: FieldDiff[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      out.push(...diffSnapshot(expected[i], actual[i], `${path}[${i}]`));
    }
    return out;
  }

  return [{ path, expected, actual }];
}

/** 把差异列表渲染成可读文本 */
export function formatDiffs(diffs: FieldDiff[], limit = 30): string {
  const lines: string[] = [];
  for (const d of diffs.slice(0, limit)) {
    lines.push(`    · ${d.path}`);
    lines.push(`        快照: ${JSON.stringify(d.expected)}`);
    lines.push(`        重算: ${JSON.stringify(d.actual)}`);
  }
  if (diffs.length > limit) {
    lines.push(`    · …… 还有 ${diffs.length - limit} 处差异`);
  }
  return lines.join('\n');
}
