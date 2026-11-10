/**
 * Rokid AI 眼镜智能体（apps/rokid-agent）—— 回归测试。
 *
 * ── 这套测试守的是什么 ───────────────────────────────────────────
 * 眼镜端跑的不是仓库里的引擎源码，而是 `apps/rokid-agent/assets/engine.js`
 * —— 一份 esbuild 打成单文件 ESM 的**构建产物**。构建产物天然比源码危险：
 * 源码改了没重新打包、esbuild 目标版本降级、tree-shaking 砍掉了某个导出、
 * 打包时踩到某个只在 ESM 下才暴露的循环依赖 —— 这些**都不会**让源码测试变红，
 * 只会在眼镜上静默地算错盘。
 *
 * 所以这里做两件事：
 *  1. **打包不失真**：拿 9 份金标准盘，把「打包产物」与「源码引擎」的排盘结果
 *     整对象逐字段比对（不做归一化 —— 同一时刻算，currentAge 也该一致，
 *     用更严的比法才能暴露问题）。
 *  2. **眼镜端纯函数不跑偏**：盘面布局 / 头部准星 / 生辰语音解析，
 *     这三个是「算错就全错、用户看不见原因」的地方，必须被钉死。
 *
 * ── 边界 ───────────────────────────────────────────────────────
 *  · 只测纯函数层（lib/chart-layout.js、lib/head-cursor.js、lib/birth-parser.js）。
 *    api.js / tts.js / storage.js / chart-source.js / voice-input.js 依赖 AIUI
 *    运行时全局对象，在 node 里跑不起来，不测。
 *  · 打包产物缺失时（还没跑 build-engine.mjs）整组跳过，不算失败。
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Solar } from 'lunar-javascript';

import {
  DIMENSION_LABELS,
  READING_DIMENSIONS,
  chart as srcChart,
  chartSummary as srcChartSummary,
  daXianLayer as srcDaXianLayer,
  liuNianLayer as srcLiuNianLayer,
  liuYueLayer as srcLiuYueLayer,
  palaceAt as srcPalaceAt,
  type Birth,
  type ChartJSON,
} from '@ziwei/chart-engine';

import type { Tester } from './harness';
import { isMainModule, runStandalone } from './harness';
import { GOLDEN_CASES, REPO_ROOT, diffSnapshot, formatDiffs } from './fixtures/golden';

/* ================================================================== *
 * 路径
 * ================================================================== */

/** 端侧打包产物（esbuild 单文件 ESM） */
const ENGINE_BUNDLE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'assets', 'engine.js');

/** 眼镜端纯函数模块 */
const LAYOUT_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'chart-layout.js');
const CURSOR_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'head-cursor.js');
const PARSER_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'birth-parser.js');
const TEMPLE_INPUT_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'temple-input.js');
const TIMELAYER_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'time-layer.js');
const BIRTH_SOURCE_MODULE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'lib', 'birth-source.js');

/** 眼镜端页面模板（界面文案契约） */
const INK_PAGE = path.join(REPO_ROOT, 'apps', 'rokid-agent', 'pages', 'index', 'index.ink');

/** Web 端盘面排布（1-based，与眼镜端 0-based 换算后必须一致） */
const WEB_PALACE_CELL = path.join(REPO_ROOT, 'apps', 'web', 'src', 'components', 'PalaceCell.tsx');

/* ================================================================== *
 * 类型（这些模块是纯 JS 无类型声明，这里补一份最小结构声明）
 * ================================================================== */

/** 打包产物需要具备的导出 */
interface EngineBundle {
  chart: (birth: Birth) => ChartJSON;
  chartSummary: (c: ChartJSON) => string;
  palaceAt: (c: ChartJSON, branch: number) => unknown;
  resolveChartDate: (
    year: number,
    month: number,
    day: number,
    clockHour: number,
    clockMinute?: number,
  ) => { year: number; month: number; day: number; hour: number };
  shichenFromClock: (clockHour: number, clockMinute?: number) => number;
  isLateZi: (clockHour: number) => boolean;
  hourLabel: (hour: number) => string;
  /** 运限三层（时间层功能依赖它们） */
  daXianLayer: (c: ChartJSON, index: number) => unknown;
  liuNianLayer: (c: ChartJSON, year: number) => unknown;
  liuYueLayer: (c: ChartJSON, year: number, month: number) => unknown;
}

/** 一个运限层（time-layer.js 归一后的形状） */
interface TimeLayer {
  key: string;
  kind: string;
  label: string;
  mingPalaceName: string;
  mingBranch: number;
  palaces: Array<{ branch: number; name: string }>;
  siHua: { lu: string; quan: string; ke: string; ji: string };
  siHuaPalaces: Record<string, number>;
}

/** 眼镜端运限层模块 */
interface TimeLayerModule {
  TIME_LAYER_KEYS: string[];
  TIME_LAYER_NAMES: Record<string, string>;
  nextLayerKey: (
    key: string,
    delta: number,
    isAvailable?: (k: string) => boolean,
  ) => string;
  currentLunarOf: (
    engine: { chart: (b: Birth) => ChartJSON },
    now?: Date,
  ) => { year: number; month: number; day: number; isLeapMonth: boolean } | null;
  buildTimeLayers: (
    chart: ChartJSON,
    engine: unknown,
    options?: { now?: Date },
  ) => Record<string, TimeLayer | null>;
  detectLayer: (text: string) => string | null;
  focusFromQuestion: (
    question: string,
    layerKey?: string,
  ) => { time?: 'liunian' | 'daxian' } | null;
  fortuneSiHuaOf: (starName: string, fortune: unknown) => string | null;
  fortuneSiHuaText: (fortune: unknown) => string;
}

/** 一个宫格的展示模型 */
interface PalaceCell {
  branch: number;
  branchName: string;
  stemName: string;
  name: string;
  isMingGong: boolean;
  isShenGong: boolean;
  isEmpty: boolean;
  majorText: string;
  minorText: string;
  majorCount: number;
  /** 运限层宫名小标（本命层为空） */
  fortuneShort?: string;
  row: number;
  col: number;
  activeClass?: string;
}

interface ChartLayoutModule {
  BRANCH_NAMES: string[];
  GRID_POS: Record<string, [number, number]>;
  SIHUA_MARKS: string[];
  DIMENSION_BY_PALACE: Record<string, string>;
  DIMENSION_LABELS: Record<string, string>;
  formatStar: (star: { name: string; siHua?: string }, fortune?: unknown) => string;
  buildCell: (palace: unknown, fortune?: unknown) => PalaceCell;
  buildBoard: (chart: unknown, fortune?: unknown) => { cells: PalaceCell[]; center: Record<string, unknown> };
  cellAt: (cells: PalaceCell[], branch: number) => PalaceCell | null;
  stepBranch: (branch: number, delta: number) => number;
  branchAt: (row: number, col: number) => number | null;
  neighborBranch: (branch: number, dx: number, dy: number) => number;
  RING_ORDER: number[];
  stepRing: (branch: number, delta: number) => number;
  markActive: (cells: PalaceCell[], branch: number) => PalaceCell[];
  dimensionOfPalace: (palaceName: string) => string | null;
  speakableStars: (majorText: string) => string;
}

interface CursorState {
  baseline: number[] | null;
  branch: number;
  x: number;
  y: number;
  yawRangeDeg: number;
  pitchRangeDeg: number;
  edgeGuard: number;
}

interface TiltState {
  branch: number;
  rest: { x: number; y: number; z: number } | null;
  axis: 'x' | 'y' | 'z';
  armed: boolean;
  tiltDeg: number;
  thresholdDeg: number;
  rearmDeg: number;
  signFlip: boolean;
}

interface HeadCursorModule {
  CURSOR_DEFAULTS: { yawRangeDeg: number; pitchRangeDeg: number; edgeGuard: number };
  TILT_DEFAULTS: { thresholdDeg: number; rearmDeg: number; axis: string; signFlip: boolean };
  isValidQuaternion: (q: unknown) => boolean;
  normalizeQuaternion: (q: unknown) => number[] | null;
  invertQuaternion: (q: number[]) => number[];
  multiplyQuaternions: (l: number[], r: number[]) => number[];
  relativeQuaternion: (baseline: number[], current: number[]) => number[] | null;
  quaternionToEuler: (q: number[]) => { yaw: number; pitch: number; roll: number } | null;
  clamp: (v: number, lo: number, hi: number) => number;
  createCursorState: (opts?: { branch?: number }) => CursorState;
  gridToBranch: (row: number, col: number) => number | null;
  updateCursor: (
    state: CursorState,
    q: number[],
  ) => { state: CursorState; changed: boolean; branch: number };
  createTiltState: (opts?: { branch?: number }) => TiltState;
  updateTilt: (
    state: TiltState,
    gravity: { x: number | null; y: number | null; z: number | null },
  ) => { state: TiltState; changed: boolean; branch: number; direction: number };
}

/** 语音解析出来的生辰 */
interface ParsedBirth {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  name: string;
  /** 时辰是兜底估的（缺失或用户明说不知道）——界面必须明示 */
  hourEstimated: boolean;
}

interface BirthParserModule {
  HOUR_BY_NAME: Record<string, number>;
  HOUR_BY_LABEL: Record<string, number>;
  HOUR_BY_PERIOD: Record<string, number>;
  /** 时辰缺失时的兜底落点（午时 = 6） */
  DEFAULT_HOUR: number;
  cnToNumber: (text: string) => number | null;
  hourFromClock: (clockHour: number) => number;
  parseBirthFromSpeech: (text: string) => ParsedBirth | null;
}

/* ================================================================== *
 * 小工具
 * ================================================================== */

/**
 * 动态 import 一个 ESM 模块。
 *
 * 眼镜端这些模块是纯 JS（没有 .d.ts），用**运行时拼出来的** specifier 导入，
 * 一是绕开 node 对 .js 无类型声明的解析问题，二是顺带验证「它们真的能被
 * 独立 ESM 加载」（眼镜端就是当独立模块加载的）。
 */
async function loadModule<T>(absPath: string): Promise<T> {
  const url = pathToFileURL(absPath).href;
  return (await import(url)) as T;
}

/** 浮点近似相等 */
function approx(actual: number, expected: number, eps = 1e-9): boolean {
  return Math.abs(actual - expected) <= eps;
}

/** 等待若干毫秒（镜腿输入契约有时序，必须用真实时钟） */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 四元数：绕 Z 轴（左右转头）转 deg 度 */
function rotZ(deg: number): number[] {
  const half = (deg * Math.PI) / 180 / 2;
  return [0, 0, Math.sin(half), Math.cos(half)];
}

/** 四元数：绕 Y 轴（抬头低头）转 deg 度 */
function rotY(deg: number): number[] {
  const half = (deg * Math.PI) / 180 / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}

/**
 * Hamilton 四元数乘法（测试里自己实现一份，不借用被测模块的实现，
 * 免得测出的是「自己和自己一致」的同义反复）。
 */
function quatMul(l: number[], r: number[]): number[] {
  const [lx, ly, lz, lw] = l;
  const [rx, ry, rz, rw] = r;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rw + lz * rw,
    lw * rw - lx * ry - ly * rz + lz * rx,
  ];
}

/**
 * 静止姿态下的重力向量（设备坐标系，模长 ≈ 9.81 m/s²）。
 *
 * 为什么不用 0 向量：加速度计读的是**带重力**的加速度，
 * 静止时读数是「重力大小」而不是 0。拿 0 当基准是写测试时的偷懒，
 * 会让「量纲对不对」这件事根本测不出来 —— 而这正是曾经的真实缺陷。
 */
const REST_GRAVITY = { x: 0, y: 9.81, z: 0 };

/**
 * 绕 X 轴（耳-耳轴 = 俯仰）倾斜 deg 度的重力向量。
 *
 * 把重力方向按俯仰角旋转即可：(0, 1, 0) → (0, cosθ, sinθ)。
 */
function tiltAboutX(deg: number, mag = 9.81): { x: number; y: number; z: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: 0, y: mag * Math.cos(rad), z: mag * Math.sin(rad) };
}

/** 只取生辰里跟排盘有关的字段（name 是 UI 字段，不参与比对） */function birthFields(r: ParsedBirth | null): Record<string, unknown> | null {
  if (!r) return null;
  const { year, month, day, hour, gender } = r;
  return { year, month, day, hour, gender };
}

/**
 * 从 Web 端 PalaceCell.tsx 里抠出 GRID_POS（1-based）。
 *
 * 为什么要直接读源码而不是抄一份常量进测试：
 * 抄常量只能证明「眼镜端 == 我抄的那份」，抄错了两边一起错，测不出来；
 * 直接读 Web 端源码，才能真的盯住「两端盘面不能画反」这件事。
 */
function parseWebGridPos(text: string): Record<number, [number, number]> {
  const block = /GRID_POS[^=]*=\s*\{([\s\S]*?)\}/.exec(text);
  assert.ok(block, 'apps/web/src/components/PalaceCell.tsx 里找不到 GRID_POS 定义');
  const out: Record<number, [number, number]> = {};
  const re = /(\d+)\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
  let m: RegExpExecArray | null = re.exec(block![1]);
  while (m) {
    out[Number(m[1])] = [Number(m[2]), Number(m[3])];
    m = re.exec(block![1]);
  }
  assert.ok(Object.keys(out).length > 0, 'Web 端 GRID_POS 解析出来是空的');
  return out;
}

/* ================================================================== *
 * 套件
 * ================================================================== */

export const suite = async (t: Tester): Promise<void> => {
  /* ---------------------------------------------------------------- *
   * A. 端侧打包产物与源码引擎「不失真」
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(ENGINE_BUNDLE)) {
    t.skip(
      '端侧打包产物不失真（A 组全部用例）',
      `缺少 ${path.relative(REPO_ROOT, ENGINE_BUNDLE)} —— 先跑 node apps/rokid-agent/scripts/build-engine.mjs`,
    );
  } else {
    const bundle = await loadModule<EngineBundle>(ENGINE_BUNDLE);

    await t.test('打包产物导出了眼镜端需要的全部排盘函数', () => {
      const need = [
        'chart',
        'chartSummary',
        'palaceAt',
        'resolveChartDate',
        'shichenFromClock',
        'isLateZi',
        'hourLabel',
        // 运限三层：时间层功能靠它们，缺一个整个时间层就没了
        'daXianLayer',
        'liuNianLayer',
        'liuYueLayer',
      ] as const;
      const missing = need.filter((k) => typeof (bundle as unknown as Record<string, unknown>)[k] !== 'function');
      assert.deepEqual(
        missing,
        [],
        `打包产物缺少导出：${missing.join(', ')}（眼镜端 chart-source.js 会直接崩）`,
      );
    });

    await t.test('打包产物的运限三层与源码引擎一致', () => {
      // 时间层是眼镜端独有的功能，只能跑在打包产物上；
      // 如果打包时运限函数的行为漂了，源码测试全绿也照样算错。
      const c = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      const fromBundle = bundle.chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });

      // 大限：当前大限落宫的宫位序号
      const dxPalace = c.palaces.find((p) => p.isCurrentDaXian);
      const dxIndex = dxPalace
        ? c.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch)
        : -1;
      assert.ok(dxIndex >= 0, '找不到当前大限，测试样本选得不对');
      assert.deepEqual(
        bundle.daXianLayer(fromBundle, dxIndex),
        srcDaXianLayer(c, dxIndex),
        '打包产物与源码引擎的大限层不一致',
      );

      assert.deepEqual(
        bundle.liuNianLayer(fromBundle, 2026),
        srcLiuNianLayer(c, 2026),
        '打包产物与源码引擎的流年层不一致',
      );

      assert.deepEqual(
        bundle.liuYueLayer(fromBundle, 2026, 9),
        srcLiuYueLayer(c, 2026, 9),
        '打包产物与源码引擎的流月层不一致',
      );
    });

    await t.test('打包产物的晚子时口径与源码引擎一致（23:30 → 次日 00 时）', () => {
      // 晚子时按次日排盘是引擎最容易在打包时被搞坏的约定：
      // 源码里是 resolveChartDate 决定的，打包时若漏导出/被 tree-shake 掉，
      // 眼镜端就会把 23 点当成当日 0 点，整张盘错一天。
      assert.deepEqual(
        bundle.resolveChartDate(1990, 1, 1, 23, 30),
        { year: 1990, month: 1, day: 2, hour: 0 },
        '打包产物的 resolveChartDate(1990,1,1,23,30) 与引擎口径不一致（晚子时应按次日排盘）',
      );
      assert.equal(bundle.isLateZi(23), true, '打包产物 isLateZi(23) 应为 true');
      assert.equal(bundle.isLateZi(22), false, '打包产物 isLateZi(22) 应为 false');
      assert.equal(bundle.shichenFromClock(23, 30), 0, '打包产物 shichenFromClock(23:30) 应为 0（子时）');
      assert.equal(bundle.hourLabel(0), '子时', '打包产物 hourLabel(0) 应为「子时」');
    });

    await t.test('打包产物在眼镜运行时（ink WASM 没有 Intl）不打 error 日志、且排盘结果不变', () => {
      // 眼镜的 ink WASM 运行时**没有 Intl**（2026-11-08 实测），而 iztro → i18next
      // 初始化时会检查 Intl.PluralRules，于是打一条 error 级日志
      //（「i18next::pluralResolver: Your environment seems not to be Intl API compatible…」）。
      // 排盘结果不受影响（i18next 会退回 compatibilityJSON v3），但设备日志面板里
      // 一直挂着这条 error，看着像本作品有 bug —— 构建期已注入最小 PluralRules 兜底
      //（见 build-engine.mjs 的 RUNTIME_SHIM）。
      //
      // 这里钉死三件事：
      //  ① 缺 Intl.PluralRules 时没有 error；
      //  ② **连 Intl 整个都没有**时也不能崩（第一版补丁就是栽在这里：
      //     它写 globalThis.Intl = {}，在眼镜运行时里写完也解析不出裸标识符 Intl，
      //     直接 ReferenceError 把端侧引擎整个搞挂 → 回落后端 → 404）；
      //  ③ 两种情况下排盘结果都跟正常环境一模一样。
      const probe = (env: string) => `
        ${env === 'no-intl' ? 'delete globalThis.Intl;' : 'delete Intl.PluralRules;'}
        const errs = [];
        const fatal = [];
        const orig = console.error;
        console.error = (...a) => { errs.push(a.map(String).join(' ')); };
        let summary = '';
        try {
          const mod = await import(${JSON.stringify(pathToFileURL(ENGINE_BUNDLE).href)});
          const c = mod.chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
          summary = mod.chartSummary(c);
        } catch (e) {
          fatal.push(e && e.message ? e.message : String(e));
        }
        console.error = orig;
        process.stdout.write(JSON.stringify({ errs, fatal, summary }));
      `;

      for (const env of ['no-pluralrules', 'no-intl'] as const) {
        const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', probe(env)], {
          encoding: 'utf8',
        });
        const parsed = JSON.parse(stdout) as {
          errs: string[];
          fatal: string[];
          summary: string;
        };

        assert.deepEqual(
          parsed.fatal,
          [],
          `${env} 环境下端侧引擎直接崩了：${parsed.fatal.join(' | ')}\n` +
            '  这会让眼镜回落到服务端排盘（ziwei.secondplanet.cc）并 404 —— ' +
            '重新打包：node apps/rokid-agent/scripts/build-engine.mjs',
        );
        assert.deepEqual(
          parsed.errs,
          [],
          `${env} 环境下仍打出 error 级日志：${parsed.errs.join(' | ')}\n` +
            '  重新打包：node apps/rokid-agent/scripts/build-engine.mjs',
        );

        const birth = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const };
        assert.equal(
          parsed.summary,
          bundle.chartSummary(bundle.chart(birth)),
          `${env} 环境下排盘结果与正常环境不一致（兜底规则必须等价于 i18next 的 v3 fallback）`,
        );
      }
    });

    for (const c of GOLDEN_CASES) {
      await t.test(`打包产物不失真 · ${c.id}`, () => {
        const fromBundle = bundle.chart(c.birth);
        const fromSource = srcChart(c.birth);

        try {
          assert.deepEqual(fromBundle, fromSource);
        } catch {
          // 整对象不相等时，把差异精确到字段路径 —— 「盘不一样了」没有用，
          // 「palaces[3] 的主星从紫微变成天府」才有用。
          const diffs = diffSnapshot(fromSource, fromBundle);
          assert.fail(
            `端侧打包产物与源码引擎排出了不同的盘：${c.id}（${c.label}）\n` +
              `  共 ${diffs.length} 处差异（源码引擎 → 打包产物）：\n${formatDiffs(diffs)}\n` +
              `  重新打包：node apps/rokid-agent/scripts/build-engine.mjs`,
          );
        }
      });
    }

    await t.test('打包产物的 chartSummary / palaceAt 与源码引擎一致', () => {
      // chart() 相同不代表摘要与取宫函数相同 —— 这两个是眼镜端「读盘」的主入口，
      // 单独再钉一次，避免打包时局部行为漂移。
      for (const c of GOLDEN_CASES) {
        const fromBundle = bundle.chart(c.birth);
        const fromSource = srcChart(c.birth);
        assert.equal(
          bundle.chartSummary(fromBundle),
          srcChartSummary(fromSource),
          `chartSummary 不一致：${c.id}`,
        );
        assert.deepEqual(
          bundle.palaceAt(fromBundle, 0),
          srcPalaceAt(fromSource, 0),
          `palaceAt(0) 不一致：${c.id}`,
        );
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * B. chart-layout.js —— 十二宫盘面布局
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(LAYOUT_MODULE)) {
    t.skip('眼镜端盘面布局（B 组全部用例）', `缺少 ${path.relative(REPO_ROOT, LAYOUT_MODULE)}`);
  } else {
    const layout = await loadModule<ChartLayoutModule>(LAYOUT_MODULE);

    await t.test('GRID_POS 恰好覆盖 12 个地支，坐标合法且互不重复', () => {
      const entries = Object.entries(layout.GRID_POS);
      assert.equal(entries.length, 12, `GRID_POS 有 ${entries.length} 个地支，应该正好 12 个`);

      const branches = entries.map(([k]) => Number(k));
      assert.deepEqual(
        [...branches].sort((a, b) => a - b),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        'GRID_POS 的地支不是 0–11 全覆盖',
      );

      const seen = new Set<string>();
      for (const [k, pos] of entries) {
        assert.ok(
          Array.isArray(pos) && pos.length === 2,
          `GRID_POS[${k}] 不是 [row, col]：${JSON.stringify(pos)}`,
        );
        for (const v of pos) {
          assert.ok(
            Number.isInteger(v) && v >= 0 && v <= 3,
            `GRID_POS[${k}] 的坐标 ${JSON.stringify(pos)} 超出 0–3 范围`,
          );
        }
        const key = pos.join(',');
        assert.ok(!seen.has(key), `GRID_POS 里有两个地支占了同一格：${key}`);
        seen.add(key);
      }
      assert.equal(seen.size, 12, 'GRID_POS 的 12 个坐标不是互不重复');
    });

    await t.test('盘面排布符合规格表（巳左上 / 亥右下）', () => {
      // 这张表是「眼镜端盘面不许画反」的规格：四四方阵 + 中宫，
      // 巳午未申在上排，辰酉 / 卯戌夹着中宫，寅丑子亥在下排。
      const expected: Record<number, [number, number]> = {
        5: [0, 0], // 巳
        6: [0, 1], // 午
        7: [0, 2], // 未
        8: [0, 3], // 申
        4: [1, 0], // 辰
        9: [1, 3], // 酉
        3: [2, 0], // 卯
        10: [2, 3], // 戌
        2: [3, 0], // 寅
        1: [3, 1], // 丑
        0: [3, 2], // 子
        11: [3, 3], // 亥
      };
      for (const [branch, pos] of Object.entries(expected)) {
        assert.deepEqual(
          layout.GRID_POS[branch],
          pos,
          `地支 ${branch}（${layout.BRANCH_NAMES[Number(branch)]}）的网格坐标不对：期望 ${JSON.stringify(pos)}`,
        );
      }
    });

    await t.test('网格排布与 Web 端 PalaceCell.tsx 一致（1-based 换算后一一对应）', () => {
      if (!fs.existsSync(WEB_PALACE_CELL)) {
        t.skip('网格排布与 Web 端一致', `缺少 ${path.relative(REPO_ROOT, WEB_PALACE_CELL)}`);
        return;
      }
      const webPos = parseWebGridPos(fs.readFileSync(WEB_PALACE_CELL, 'utf8'));

      assert.equal(
        Object.keys(webPos).length,
        Object.keys(layout.GRID_POS).length,
        'Web 端与眼镜端的 GRID_POS 地支数量对不上',
      );

      for (const [branch, rokidPos] of Object.entries(layout.GRID_POS)) {
        const web = webPos[Number(branch)];
        assert.ok(web, `Web 端 GRID_POS 里没有地支 ${branch}`);
        // Web 端是 1-based（1..4），眼镜端是 0-based（0..3）
        assert.deepEqual(
          [web[0] - 1, web[1] - 1],
          rokidPos,
          `地支 ${branch} 两端排布不一致：Web 端 ${JSON.stringify(web)} → 换算 ${JSON.stringify([web[0] - 1, web[1] - 1])}，` +
            `眼镜端 ${JSON.stringify(rokidPos)}（眼镜端和网页端盘面画反了）`,
        );
      }
    });

    await t.test('branchAt：中宫返回 null（不是宫位，不该被选中）', () => {
      assert.equal(layout.branchAt(1, 1), null, 'branchAt(1,1) 应为 null');
      assert.equal(layout.branchAt(1, 2), null, 'branchAt(1,2) 应为 null');
      assert.equal(layout.branchAt(2, 1), null, 'branchAt(2,1) 应为 null');
      assert.equal(layout.branchAt(2, 2), null, 'branchAt(2,2) 应为 null');
      assert.equal(layout.branchAt(0, 0), 5, 'branchAt(0,0) 应为巳(5)');
      assert.equal(layout.branchAt(3, 3), 11, 'branchAt(3,3) 应为亥(11)');
    });

    await t.test('neighborBranch：往中宫走不动、越界也不动', () => {
      // 镜腿方向键导航。中宫不是宫位，「往里走」宁可不动也不要让用户
      // 以为选中了什么；越界同理。
      assert.equal(layout.neighborBranch(4, 1, 0), 4, '辰(4) 往右进中宫应原地不动');
      assert.equal(layout.neighborBranch(9, -1, 0), 9, '酉(9) 往左进中宫应原地不动');
      assert.equal(layout.neighborBranch(3, 1, 0), 3, '卯(3) 往右进中宫应原地不动');
      assert.equal(layout.neighborBranch(10, -1, 0), 10, '戌(10) 往左进中宫应原地不动');
      assert.equal(layout.neighborBranch(5, -1, 0), 5, '巳(5) 往左越界应原地不动');
      assert.equal(layout.neighborBranch(5, 0, -1), 5, '巳(5) 往上越界应原地不动');
      assert.equal(layout.neighborBranch(11, 0, 1), 11, '亥(11) 往下越界应原地不动');
      // 相邻的方向还是要能走通，否则导航直接失灵
      assert.equal(layout.neighborBranch(4, 0, 1), 3, '辰(4) 往下应是卯(3)');
      assert.equal(layout.neighborBranch(5, 1, 0), 6, '巳(5) 往右应是午(6)');
    });

    await t.test('stepRing：左右键沿盘面外圈巡宫，十二宫全覆盖', () => {
      // 镜腿按键是模拟器里**唯一**的选择通道（眼镜没有触摸屏），
      // 所以左右键必须能走到全部十二宫 —— 网格横移够不到辰/卯/酉/戌。
      assert.equal(layout.RING_ORDER.length, 12, '外圈应恰好 12 个宫');
      assert.equal(new Set(layout.RING_ORDER).size, 12, '外圈不应有重复宫位');

      const covered = new Set(layout.RING_ORDER);
      for (let b = 0; b < 12; b += 1) {
        assert.ok(covered.has(b), `外圈应覆盖地支 ${b}`);
      }

      // +1 = 顺着外圈走（屏幕上顺时针：顶排从左到右，右列往下，底排从右到左）
      assert.equal(layout.stepRing(5, 1), 6, '巳(5) 顺时针应是午(6)');
      assert.equal(layout.stepRing(11, 1), 0, '亥(11) 顺时针应是子(0)');
      assert.equal(layout.stepRing(0, 1), 1, '子(0) 顺时针应是丑(1)（底排是从右往左数的）');
      assert.equal(layout.stepRing(4, 1), 5, '辰(4) 顺时针应是巳(5)');
      assert.equal(layout.stepRing(5, -1), 4, '巳(5) 逆时针应是辰(4)');

      // 走满一圈回到原位
      for (const start of layout.RING_ORDER) {
        let b = start;
        for (let i = 0; i < 12; i += 1) b = layout.stepRing(b, 1);
        assert.equal(b, start, `从 ${start} 走 12 步应回到原位`);
      }

      // 外圈相邻的两宫在盘面上必须挨着（不能「跳宫」）
      for (let i = 0; i < 12; i += 1) {
        const a = layout.RING_ORDER[i];
        const c = layout.RING_ORDER[(i + 1) % 12];
        const diff = Math.abs(a - c);
        assert.ok(diff === 1 || diff === 11, `外圈相邻的 ${a} 与 ${c} 在盘面上应挨着`);
      }
    });

    await t.test('buildCell：主星最多 3 颗、辅星最多 2 颗，四化渲染成「星名(标记)」', () => {
      const cell = layout.buildCell({
        branch: 0,
        branchName: '子',
        stemName: '甲',
        name: '命宫',
        isMingGong: true,
        isShenGong: false,
        isEmpty: false,
        stars: [
          { name: '紫微', type: 'major', siHua: '禄' },
          { name: '天机', type: 'major' },
          { name: '太阳', type: 'major', siHua: '忌' },
          { name: '武曲', type: 'major' },
          { name: '文曲', type: 'minor' },
          { name: '左辅', type: 'minor' },
          { name: '擎羊', type: 'minor' },
        ],
      });

      assert.equal(cell.majorCount, 4, '主星总数应如实记录为 4（用于「+N」提示）');
      assert.ok(cell.majorText.includes('紫微(禄)'), `四化应渲染成「星名(标记)」：${cell.majorText}`);
      assert.ok(cell.majorText.includes('太阳(忌)'), `四化应渲染成「星名(标记)」：${cell.majorText}`);
      assert.ok(!cell.majorText.includes('武曲'), '第 4 颗主星不该显示在 HUD 上');
      assert.ok(cell.majorText.includes('+1'), `超出的主星应以「+N」提示：${cell.majorText}`);
      assert.equal(cell.minorText.split(' ').filter(Boolean).length, 2, '辅星最多显示 2 颗');
      assert.ok(!cell.minorText.includes('擎羊'), '第 3 颗辅星不该显示在 HUD 上');
      assert.equal(cell.row, 3, '子宫在第 4 行（0-based）');
      assert.equal(cell.col, 2, '子宫在第 3 列（0-based）');
    });

    await t.test('buildCell：空宫不崩', () => {
      const cell = layout.buildCell({ branch: 1, stars: [] });
      assert.equal(cell.majorText, '', '空宫不该有主星文本');
      assert.equal(cell.minorText, '', '空宫不该有辅星文本');
      assert.equal(cell.majorCount, 0, '空宫的主星数应为 0');
      assert.equal(cell.branchName, '丑', '没给 branchName 时应回退到地支名');
    });

    await t.test('formatStar：运限层里运限四化优先，本命四化隐藏', () => {
      // 单色绿 HUD 上没有颜色可区分，本命四化和运限四化会长得一模一样。
      // 规则：进了运限层就只看这一层的四化，带「限」/「流」前缀。
      const fortune = {
        kind: 'daxian',
        siHua: { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' },
        palaces: [],
      };
      assert.equal(
        layout.formatStar({ name: '廉贞', siHua: '禄' }, fortune),
        '廉贞(限禄)',
        '大限层的化禄星应渲染成「限禄」',
      );
      assert.equal(
        layout.formatStar({ name: '太阳', siHua: '忌' }, fortune),
        '太阳(限忌)',
        '大限层的化忌星应渲染成「限忌」',
      );
      // 本命四化在这一层被顶掉，不该同时挂两个标记
      assert.equal(
        layout.formatStar({ name: '紫微', siHua: '禄' }, fortune),
        '紫微',
        '本命四化在运限层应隐藏',
      );
      // 流年 / 流月用「流」前缀
      const liunian = { kind: 'liunian', siHua: { lu: '天同', quan: '', ke: '', ji: '' }, palaces: [] };
      assert.equal(
        layout.formatStar({ name: '天同' }, liunian),
        '天同(流禄)',
        '流年层的化禄星应渲染成「流禄」',
      );
      // 本命层不受影响
      assert.equal(
        layout.formatStar({ name: '紫微', siHua: '禄' }),
        '紫微(禄)',
        '本命层的本命四化应照常显示',
      );
    });

    await t.test('buildCell：运限层给出宫名小标，且与本命宫名相同时不显示', () => {
      const palace = {
        branch: 0,
        branchName: '子',
        stemName: '甲',
        name: '命宫',
        stars: [{ name: '紫微', type: 'major' }],
      };
      const fortune = {
        kind: 'liunian',
        siHua: { lu: '', quan: '', ke: '', ji: '' },
        palaces: [
          { branch: 0, name: '命宫' },
          { branch: 1, name: '兄弟' },
        ],
      };
      const cell = layout.buildCell(palace, fortune);
      assert.equal(cell.name, '命宫', '本命宫名不能被运限层覆盖');
      assert.equal(
        cell.fortuneShort,
        '',
        '本命宫名与运限宫名相同时不该重复显示小标',
      );

      const other = layout.buildCell({ ...palace, branch: 1, name: '财帛宫' }, fortune);
      assert.equal(
        other.fortuneShort,
        '兄弟宫',
        '运限宫名应补上「宫」字并作为小标显示',
      );

      // 本命层没有小标
      assert.equal(
        layout.buildCell(palace).fortuneShort,
        '',
        '本命层不该出现运限宫名小标',
      );
    });

    await t.test('buildBoard：运限层的宫名小标与本命盘宫名不打架', () => {
      // 引擎里同一个宫有两套叫法（本命「仆役宫」/ 运限「交友宫」）。
      // 不归一的话一格里会出现「仆役宫 交友宫」，看着像 bug。
      const c = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      const layer = srcLiuNianLayer(c, 2026);
      const board = layout.buildBoard(c, layer);
      for (const cell of board.cells) {
        if (!cell.fortuneShort) continue;
        assert.notEqual(
          cell.fortuneShort,
          '交友宫',
          `地支 ${cell.branchName} 的运限小标仍是「交友宫」，没跟本命盘口径统一`,
        );
        assert.ok(
          cell.fortuneShort.endsWith('宫'),
          `运限小标应带「宫」字：${cell.fortuneShort}`,
        );
      }
    });

    await t.test('speakableStars：盘面文本转成能听的句子', () => {
      // 眼镜上主要靠听。屏幕上带括号是给眼睛看的，念出来必须是人话。
      assert.equal(
        layout.speakableStars('紫微(限禄) 天机(限权)'),
        '紫微化禄、天机化权',
        '运限四化应念成「化禄 / 化权」，不念括号也不念「限」前缀',
      );
      assert.equal(
        layout.speakableStars('紫微(禄) 天机'),
        '紫微化禄、天机',
        '本命四化应念成「化禄」',
      );
      assert.equal(
        layout.speakableStars('紫微(禄) +1'),
        '紫微化禄、另有1星',
        '「+N」应转成「另有 N 星」',
      );
      assert.equal(layout.speakableStars(''), '空宫', '空宫要说出来');
    });

    await t.test('markActive：只有选中的宫带 activeClass=on', () => {
      const cells = [
        layout.buildCell({ branch: 0, stars: [] }),
        layout.buildCell({ branch: 1, stars: [] }),
        layout.buildCell({ branch: 2, stars: [] }),
      ];
      const marked = layout.markActive(cells, 1);
      assert.equal(marked.length, 3, 'markActive 应返回同样数量的宫格');
      assert.deepEqual(
        marked.map((c) => c.activeClass),
        ['', 'on', ''],
        '有且只有一个宫被高亮',
      );
      assert.equal(
        marked.filter((c) => c.activeClass === 'on').length,
        1,
        'activeClass=on 的宫必须恰好一个',
      );
      // 不能就地改入参，否则模板重渲染时高亮会串
      assert.equal(
        (cells[1] as PalaceCell).activeClass,
        undefined,
        'markActive 不该就地修改入参数组',
      );
    });

    await t.test('dimensionOfPalace：十二宫映射到解读维度，且维度都在引擎的 13 维里', () => {
      // 键用的是**本命盘真正写出来的宫名**（含「仆役宫」）。
      // 引擎里同一个宫有两套叫法：本命盘叫「仆役宫」（iztro 血统），
      // 运限十二宫叫「交友宫」（PALACE_NAMES_ORDER）—— 见 PALACE_NAME_CANON。
      const expected: Record<string, string> = {
        命宫: 'overview',
        兄弟宫: 'family',
        夫妻宫: 'love',
        子女宫: 'children',
        财帛宫: 'wealth',
        疾厄宫: 'health',
        迁移宫: 'move',
        仆役宫: 'friends',
        官禄宫: 'career',
        田宅宫: 'home',
        福德宫: 'spirit',
        父母宫: 'parents',
      };
      for (const [palace, dimension] of Object.entries(expected)) {
        assert.equal(
          layout.dimensionOfPalace(palace),
          dimension,
          `「${palace}」应映射到 ${dimension}`,
        );
      }
      assert.equal(
        Object.keys(expected).length,
        Object.keys(layout.DIMENSION_BY_PALACE).length,
        '眼镜端映射的宫位数量与规格不一致',
      );
      // 维度 key 必须是引擎认识的，否则检索层会查不到数据
      for (const dimension of Object.values(expected)) {
        assert.ok(
          (READING_DIMENSIONS as readonly string[]).includes(dimension),
          `维度 ${dimension} 不在引擎的 READING_DIMENSIONS 里`,
        );
      }
      // 中文标签也要跟引擎一致，避免眼镜端显示成另一套词
      for (const dimension of Object.values(expected)) {
        assert.equal(
          layout.DIMENSION_LABELS[dimension],
          DIMENSION_LABELS[dimension as keyof typeof DIMENSION_LABELS],
          `维度 ${dimension} 的中文标签与引擎 DIMENSION_LABELS 不一致`,
        );
      }
    });

    await t.test('dimensionOfPalace：引擎真实产出的宫名都能查到维度（不许有宫取不到解读）', () => {
      // 这是踩过的坑：映射表写的是「交友宫」，引擎的盘上却是「仆役宫」，
      // 结果这一宫永远落到 null → 解读静默退回「命格总览」，
      // 人际那一维在眼镜端根本取不到。
      // 这里不写死宫名，直接拿引擎排出来的盘逐宫验证。
      const c = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      for (const p of c.palaces) {
        const dimension = layout.dimensionOfPalace(p.name);
        assert.ok(
          dimension,
          `引擎盘上的「${p.name}」（${p.branchName}）查不到解读维度 —— 这一宫会退回总览`,
        );
        assert.ok(
          (READING_DIMENSIONS as readonly string[]).includes(dimension),
          `「${p.name}」映射到的维度 ${dimension} 不在引擎的 READING_DIMENSIONS 里`,
        );
      }
      // 别名也要认：运限层给的「交友宫」是同一个宫
      assert.equal(
        layout.dimensionOfPalace('交友宫'),
        'friends',
        '「交友宫」应与「仆役宫」指向同一维度',
      );
    });
  }

  /* ---------------------------------------------------------------- *
   * C. head-cursor.js —— 头部准星
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(CURSOR_MODULE)) {
    t.skip('眼镜端头部准星（C 组全部用例）', `缺少 ${path.relative(REPO_ROOT, CURSOR_MODULE)}`);
  } else {
    const cursor = await loadModule<HeadCursorModule>(CURSOR_MODULE);

    await t.test('normalizeQuaternion：非法输入返回 null', () => {
      // 传感器偶发读到坏数据时不能让它把整个准星状态机带崩。
      assert.equal(cursor.normalizeQuaternion([0, 0, 0, 0]), null, '零模四元数应返回 null');
      assert.equal(cursor.normalizeQuaternion([1, 2, 3]), null, '长度不足 4 应返回 null');
      assert.equal(cursor.normalizeQuaternion([1, 2, 3, Number.NaN]), null, '含 NaN 应返回 null');
      assert.equal(cursor.normalizeQuaternion('abc'), null, '非数组应返回 null');
      assert.equal(cursor.normalizeQuaternion(null), null, 'null 应返回 null');
      assert.deepEqual(cursor.normalizeQuaternion([0, 0, 0, 2]), [0, 0, 0, 1], '非单位四元数应被归一化');
    });

    await t.test('四元数 → 欧拉角：绕 Y 轴 90° 得到 pitch ≈ π/2（抬头低头）', () => {
      // 约定说明：本工程用 ZYX 内旋分解 —— yaw 绕 Z（左右转头）、
      // pitch 绕 Y（抬头低头）、roll 绕 X。这与 AIUI AbsoluteOrientationSensor
      // 「Y 轴朝上」的姿态约定一致，所以绕 Y 轴转 90° 落在 **pitch** 上。
      const euler = cursor.quaternionToEuler(rotY(90));
      assert.ok(euler, 'rotY(90) 应能换算出欧拉角');
      assert.ok(
        approx(euler.pitch, Math.PI / 2, 1e-9),
        `绕 Y 轴 90° 的 pitch 应为 π/2，实际 ${euler.pitch}`,
      );
      assert.ok(approx(euler.yaw, 0, 1e-9), `绕 Y 轴 90° 的 yaw 应为 0，实际 ${euler.yaw}`);
      assert.ok(approx(euler.roll, 0, 1e-9), `绕 Y 轴 90° 的 roll 应为 0，实际 ${euler.roll}`);
    });

    await t.test('四元数 → 欧拉角：绕 Z 轴 90° 得到 yaw ≈ π/2（左右转头）', () => {
      const euler = cursor.quaternionToEuler(rotZ(90));
      assert.ok(euler, 'rotZ(90) 应能换算出欧拉角');
      assert.ok(
        approx(euler.yaw, Math.PI / 2, 1e-9),
        `绕 Z 轴 90° 的 yaw 应为 π/2，实际 ${euler.yaw}`,
      );
      assert.ok(approx(euler.pitch, 0, 1e-9), `绕 Z 轴 90° 的 pitch 应为 0，实际 ${euler.pitch}`);
      assert.ok(approx(euler.roll, 0, 1e-9), `绕 Z 轴 90° 的 roll 应为 0，实际 ${euler.roll}`);
    });

    await t.test('relativeQuaternion：同一姿态返回单位四元数', () => {
      const rel = cursor.relativeQuaternion(rotZ(30), rotZ(30));
      assert.ok(rel, '同一姿态应能算出相对四元数');
      const norm = Math.sqrt(rel.reduce((s, v) => s + v * v, 0));
      assert.ok(approx(norm, 1, 1e-9), `相对四元数应是单位四元数，实际模长 ${norm}`);
      assert.ok(approx(rel[3], 1, 1e-9), `同一姿态的相对四元数 w 应为 1，实际 ${rel[3]}`);
      for (const v of rel.slice(0, 3)) {
        assert.ok(approx(v, 0, 1e-9), `同一姿态的相对四元数 x/y/z 应为 0，实际 ${JSON.stringify(rel)}`);
      }
      assert.equal(cursor.relativeQuaternion([0, 0, 0, 0], [0, 0, 0, 1]), null, '非法基准应返回 null');
    });

    await t.test('gridToBranch：四角有宫位，中宫返回 null', () => {
      assert.equal(cursor.gridToBranch(0, 0), 5, '左上角应是巳(5)');
      assert.equal(cursor.gridToBranch(0, 3), 8, '右上角应是申(8)');
      assert.equal(cursor.gridToBranch(3, 0), 2, '左下角应是寅(2)');
      assert.equal(cursor.gridToBranch(3, 3), 11, '右下角应是亥(11)');
      assert.equal(cursor.gridToBranch(1, 1), null, '中宫 (1,1) 应为 null');
      assert.equal(cursor.gridToBranch(1, 2), null, '中宫 (1,2) 应为 null');
      assert.equal(cursor.gridToBranch(2, 1), null, '中宫 (2,1) 应为 null');
      assert.equal(cursor.gridToBranch(2, 2), null, '中宫 (2,2) 应为 null');
      assert.equal(cursor.gridToBranch(-1, 0), null, '越界应为 null');
      assert.equal(cursor.gridToBranch(0, 4), null, '越界应为 null');
    });

    await t.test('updateCursor：第一次只建立基准，不换宫', () => {
      // 第一次读到姿态时用户还没「看」哪儿，这时候就跳宫会让人莫名其妙。
      const state = cursor.createCursorState({ branch: 3 });
      const r = cursor.updateCursor(state, [0, 0, 0, 1]);
      assert.equal(r.changed, false, '第一次调用不应换宫');
      assert.equal(r.branch, 3, '第一次调用不应改变选中的宫');
      assert.ok(r.state.baseline, '第一次调用应建立基准姿态');
    });

    await t.test('updateCursor：相对旋转能把准星移到预期宫位', () => {
      const state = cursor.createCursorState({ branch: 0 });
      const s = cursor.updateCursor(state, [0, 0, 0, 1]).state;

      // 基准是单位四元数时，相对旋转 = 当前姿态。
      // 抬头 12°（pitch）+ 左偏 5.5°（yaw）→ 网格 (0,1) → 午(6)
      const r1 = cursor.updateCursor(s, quatMul(rotZ(-5.5), rotY(12)));
      assert.equal(r1.changed, true, '准星应发生换宫');
      assert.equal(r1.branch, 6, '应选中午宫(6)');

      // 右偏 16° + 抬头 4° → 网格 (1,3) → 酉(9)
      const r2 = cursor.updateCursor(r1.state, quatMul(rotZ(16), rotY(4)));
      assert.equal(r2.changed, true, '准星应发生换宫');
      assert.equal(r2.branch, 9, '应选中酉宫(9)');
    });

    await t.test('updateCursor：准星落进中宫时保持原宫，不丢选择', () => {
      const state = cursor.createCursorState({ branch: 4 });
      const s = cursor.updateCursor(state, [0, 0, 0, 1]).state;

      // 右偏 5° + 低头 3° → 网格 (2,2) = 中宫
      const r = cursor.updateCursor(s, quatMul(rotZ(5), rotY(-3)));
      assert.equal(r.changed, false, '落在中宫不应算换宫');
      assert.equal(r.branch, 4, '落在中宫时应保持原来的选中宫，不丢选择');
    });

    await t.test('updateCursor：准星压在格子边界上不换宫（边缘保护）', () => {
      const state = cursor.createCursorState({ branch: 0 });
      const s = cursor.updateCursor(state, [0, 0, 0, 1]).state;

      // 右偏 11° 恰好落在列边界上 —— 不做边缘保护就会在两宫之间反复跳。
      const r = cursor.updateCursor(s, quatMul(rotZ(11), rotY(0)));
      assert.equal(r.changed, false, '压在边界上不应换宫');
      assert.equal(r.branch, 0, '压在边界上应保持原宫');
    });

    await t.test('updateTilt：第一次读数只建立静止基准', () => {
      const state = cursor.createTiltState({ branch: 0 });
      const r = cursor.updateTilt(state, REST_GRAVITY);
      assert.equal(r.changed, false, '第一次读数不应切宫');
      assert.equal(r.branch, 0, '第一次读数不应改变选中的宫');
      assert.deepEqual(r.state.rest, REST_GRAVITY, '第一次读数应建立静止基准');
      assert.equal(r.state.tiltDeg, 0, '第一次读数的倾角应为 0');
    });

    await t.test('updateTilt：倾角未达阈值不切宫', () => {
      const state = cursor.createTiltState({ branch: 0 });
      const s = cursor.updateTilt(state, REST_GRAVITY).state;
      const r = cursor.updateTilt(s, tiltAboutX(8));
      assert.equal(r.changed, false, '未达阈值不应切宫');
      assert.equal(r.branch, 0, '未达阈值应保持原宫');
      assert.ok(
        Math.abs(r.state.tiltDeg - 8) < 0.5,
        `8° 俯仰应读出约 8°，实际 ${r.state.tiltDeg}`,
      );
    });

    await t.test('updateTilt：倾角超过阈值切一宫', () => {
      const state = cursor.createTiltState({ branch: 0 });
      const s = cursor.updateTilt(state, REST_GRAVITY).state;
      const r = cursor.updateTilt(s, tiltAboutX(20));
      assert.equal(r.changed, true, '超过阈值应切宫');
      assert.equal(r.branch, 1, '超过阈值应切到下一宫');
      assert.equal(r.direction, 1, '正向倾斜的切宫方向应为 +1');
    });

    await t.test('updateTilt：保持倾斜不会连切（必须回中才允许下一次）', () => {
      // 这是曾经的真 bug：切宫后累计角清零，但「保持倾斜」时下一次读数
      // 又立刻越过阈值 → 一次抬手连跳好几宫。
      const state = cursor.createTiltState({ branch: 0 });
      let s = cursor.updateTilt(state, REST_GRAVITY).state;
      s = cursor.updateTilt(s, tiltAboutX(20)).state;
      assert.equal(s.branch, 1, '第一次倾斜应切一宫');

      // 继续保持倾斜（甚至更陡）—— 不该再切
      const held = cursor.updateTilt(s, tiltAboutX(30));
      assert.equal(held.changed, false, '保持倾斜不应连切');
      assert.equal(held.branch, 1, '保持倾斜应停在原宫');

      // 回中 → 重新允许触发
      const centered = cursor.updateTilt(held.state, REST_GRAVITY);
      assert.equal(centered.state.armed, true, '回中后应重新允许切宫');

      // 再来一次 → 这才切
      const again = cursor.updateTilt(centered.state, tiltAboutX(20));
      assert.equal(again.changed, true, '回中后再次倾斜应切宫');
      assert.equal(again.branch, 2, '应切到下一宫');
    });

    await t.test('updateTilt：阈值比的是「度」，不是 m/s²', () => {
      // 回归测试：曾经的实现拿加速度差（m/s²）去比「度」的阈值。
      // 重力约 9.8，低头 15° 只让相关分量变化约 0.3 —— 那样真机上永远触发不了。
      const state = cursor.createTiltState({ branch: 0 });
      const s = cursor.updateTilt(state, REST_GRAVITY).state;

      const small = cursor.updateTilt(s, tiltAboutX(15));
      assert.equal(small.changed, true, '真实 15° 俯仰应当能触发切宫');

      // 手抖级别的抖动（0.05 m/s²）不该触发
      const jitter = cursor.updateTilt(s, {
        x: REST_GRAVITY.x + 0.05,
        y: REST_GRAVITY.y,
        z: REST_GRAVITY.z,
      });
      assert.equal(jitter.changed, false, '微小抖动不应触发切宫');
    });

    await t.test('updateTilt：模长为 0 的读数被丢弃，不污染基准', () => {
      // 眼镜刚启动时加速度计确实会给 0 —— 拿它当基准会算出一堆 NaN。
      const state = cursor.createTiltState({ branch: 0 });
      const r = cursor.updateTilt(state, { x: 0, y: 0, z: 0 });
      assert.equal(r.state.rest, null, '零向量不应被当成静止基准');
      const r2 = cursor.updateTilt(r.state, REST_GRAVITY);
      assert.deepEqual(r2.state.rest, REST_GRAVITY, '后续有效读数应正常建立基准');
    });
  }

  /* ---------------------------------------------------------------- *
   * D. birth-parser.js —— 语音录入生辰
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(PARSER_MODULE)) {
    t.skip('眼镜端生辰语音解析（D 组全部用例）', `缺少 ${path.relative(REPO_ROOT, PARSER_MODULE)}`);
  } else {
    const parser = await loadModule<BirthParserModule>(PARSER_MODULE);

    await t.test('「1990年1月1日 子时 男」→ 1990-01-01 子时 男', () => {
      // 眼镜上没有键盘，语音是唯一的主输入 —— 解析错了用户还看不出来，
      // 排出来的盘会全错。
      assert.deepEqual(
        birthFields(parser.parseBirthFromSpeech('1990年1月1日 子时 男')),
        { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' },
        '「1990年1月1日 子时 男」解析结果不对',
      );
    });

    await t.test('「我是一九九零年一月一日生的，晚上十一点，女」→ 1990-01-02 子时 女', () => {
      // 「晚上十一点」= 23 点 = **晚子时**，按次日排盘（引擎 resolveChartDate 同口径）。
      // 这里的期望值曾经写成 hour:10（戌时），那是错的：戌时是 19–20:59，
      // 而 23 点属于子时（0），且晚子时要 +1 天 → 1990-01-02。
      // 中文数字年份「一九九零」按位读 = 1990，也是这条能过的前提。
      assert.deepEqual(
        birthFields(parser.parseBirthFromSpeech('我是一九九零年一月一日生的，晚上十一点，女')),
        { year: 1990, month: 1, day: 2, hour: 0, gender: 'female' },
        '「我是一九九零年一月一日生的，晚上十一点，女」解析结果不对（中文数字年 / 晚子时按次日）',
      );
    });

    await t.test('口语时段 + 钟点 → 换算成真实钟点', () => {
      // 「下午三点」= 15 点（未时 8），「早上八点」= 8 点（辰时 4），
      // 「中午一点」= 13 点（未时 7）。
      // 口语时段词不能把钟点吃掉 —— 那样「晚上十一点」会被听成 11 点。
      const cases: Array<[string, number]> = [
        ['1990年1月1日 下午三点 男', 8],
        ['1990年1月1日 早上八点 男', 4],
        ['1990年1月1日 中午一点 男', 7],
      ];
      for (const [text, expectHour] of cases) {
        const parsed = parser.parseBirthFromSpeech(text);
        assert.ok(parsed, `「${text}」应能解析出生辰`);
        assert.equal(parsed.hour, expectHour, `「${text}」的时辰序号不对`);
      }
    });

    await t.test('中文数字年份按位读（一九九零 = 1990）', () => {
      // 年份是**逐位念**的，和「十进制位值」体系（十=10、二十三=23）不同，
      // 走 cnToNumber 一定解析不出来 —— 这是曾经的真实缺陷。
      const parsed = parser.parseBirthFromSpeech('二零零八年八月八日 辰时 男');
      assert.ok(parsed, '「二零零八年八月八日 辰时 男」应能解析出生辰');
      assert.equal(parsed.year, 2008, '「二零零八」应为 2008');
      assert.equal(parsed.month, 8, '「八」月应为 8');
      assert.equal(parsed.day, 8, '「八」日应为 8');
    });

    await t.test('「1990-01-01 23点 male」→ 晚子时按次日排盘（1990-01-02 子时）', () => {
      // 晚子时（23 点）按**次日**排盘，是引擎与语音解析共用的口径；
      // 这里错了，整张盘会差一天。
      assert.deepEqual(
        birthFields(parser.parseBirthFromSpeech('1990-01-01 23点 male')),
        { year: 1990, month: 1, day: 2, hour: 0, gender: 'male' },
        '「1990-01-01 23点 male」解析结果不对（晚子时应按次日排盘，时辰序号为 0）',
      );
    });

    await t.test('「2000年2月29号 丑时」→ 闰年 2 月 29 日丑时', () => {
      // 闰年 2 月 29 日 + 「号」字写法 + 丑时 → 时辰序号 1。
      // 这句没带性别，按「缺性别返回 null」的规则单独测日期时辰部分：
      const withGender = parser.parseBirthFromSpeech('2000年2月29号 丑时 男');
      assert.ok(withGender, '「2000年2月29号 丑时 男」应能解析出生辰');
      assert.deepEqual(
        birthFields(withGender),
        { year: 2000, month: 2, day: 29, hour: 1, gender: 'male' },
        '「2000年2月29号 丑时」的日期/时辰解析不对（丑时应为时辰序号 1）',
      );
    });

    await t.test('缺时辰 → 落午时并标记为估算（不再是死路）', () => {
      // 旧行为是 return null（"缺时辰时不该猜一个时辰，应返回 null 让用户补"）。
      // 但眼镜上没有键盘，用户**补不了**「子时」这种术语，也没有第二个机会 ——
      // 他会被永久卡在录入浮层。2026-11-08 改成：落兜底时辰 + 显式标记为估算，
      // 界面必须把「时辰按午时估算」显示出来。
      const parsed = parser.parseBirthFromSpeech('1990年1月1日 男');
      assert.ok(parsed, '缺时辰不该再让整次解析失败');
      assert.equal(parsed.hour, parser.DEFAULT_HOUR, '缺时辰应落到兜底时辰');
      assert.equal(parsed.hourEstimated, true, '兜底时辰必须标记为估算');
    });

    await t.test('「不知道时辰」→ 同样落兜底并标估算', () => {
      const parsed = parser.parseBirthFromSpeech('1990年1月1日 我不知道时辰 男');
      assert.ok(parsed, '「不知道时辰」不该解析失败');
      assert.equal(parsed.hour, parser.DEFAULT_HOUR, '「不知道时辰」应落到兜底时辰');
      assert.equal(parsed.hourEstimated, true, '必须标记为估算');
    });

    await t.test('明说「不确定是子时还是丑时」→ 不采信时辰名', () => {
      // 「辰时/子时」这类词在「不确定」语境里是二选一的一项，不是答案；
      // 而且「时辰」这个词本身会被时辰名正则误读成「辰时」。
      const parsed = parser.parseBirthFromSpeech('1990年1月1日 我不确定是子时还是丑时 男');
      assert.ok(parsed, '这类说法不该解析失败');
      assert.equal(parsed.hour, parser.DEFAULT_HOUR, '不确定时不能采信句子里的时辰名');
      assert.equal(parsed.hourEstimated, true, '必须标记为估算');
    });

    await t.test('说了「早上」→ 卯时且不标估算', () => {
      const parsed = parser.parseBirthFromSpeech('1990年1月1日 早上 男');
      assert.ok(parsed, '「早上」应能解析');
      assert.equal(parsed.hour, 3, '早上应落到卯时（时辰序号 3）');
      assert.equal(parsed.hourEstimated, false, '用户给了时段，不该标成估算');
    });

    await t.test('明确说了时辰 → 不标估算', () => {
      const parsed = parser.parseBirthFromSpeech('1990年1月1日 子时 男');
      assert.ok(parsed);
      assert.equal(parsed.hourEstimated, false, '用户明说了时辰，不该标成估算');
    });

    await t.test('缺性别 → 返回 null', () => {
      assert.equal(
        parser.parseBirthFromSpeech('1990年1月1日 子时'),
        null,
        '缺性别时不该猜性别，应返回 null 让用户补',
      );
    });

    await t.test('年份越界 → 返回 null', () => {
      assert.equal(
        parser.parseBirthFromSpeech('1800年1月1日 子时 男'),
        null,
        '1800 年超出数据集覆盖范围，应返回 null',
      );
      assert.equal(
        parser.parseBirthFromSpeech('2200年1月1日 子时 男'),
        null,
        '2200 年超出数据集覆盖范围，应返回 null',
      );
    });

    await t.test('cnToNumber：零=0、十=10、十一=11、二十三=23', () => {
      assert.equal(parser.cnToNumber('零'), 0, '「零」应为 0');
      assert.equal(parser.cnToNumber('十'), 10, '「十」应为 10');
      assert.equal(parser.cnToNumber('十一'), 11, '「十一」应为 11');
      assert.equal(parser.cnToNumber('二十三'), 23, '「二十三」应为 23');
      assert.equal(parser.cnToNumber('九'), 9, '「九」应为 9');
      assert.equal(parser.cnToNumber('乱七八糟'), null, '非法中文数字应返回 null');
    });

    await t.test('语音解析的晚子时口径与引擎 resolveChartDate 一致', () => {
      // 语音解析与引擎必须说同一套话，否则「我二十三点出生」排出来的盘
      // 和网页端排出来的不是一张。
      const parsed = parser.parseBirthFromSpeech('1990-01-01 23:30 男');
      assert.ok(parsed, '「1990-01-01 23:30 男」应能解析出生辰');
      assert.deepEqual(
        { year: parsed.year, month: parsed.month, day: parsed.day, hour: parsed.hour },
        { year: 1990, month: 1, day: 2, hour: 0 },
        '语音解析的晚子时口径与引擎不一致',
      );
    });
  }

  /* ---------------------------------------------------------------- *
   * E. time-layer.js —— 运限四层（时间层）
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(TIMELAYER_MODULE)) {
    t.skip('眼镜端运限层（E 组全部用例）', `缺少 ${path.relative(REPO_ROOT, TIMELAYER_MODULE)}`);
  } else {
    const tl = await loadModule<TimeLayerModule>(TIMELAYER_MODULE);

    /** 引擎三件套（运限层只依赖这三个函数） */
    const fortuneEngine = {
      chart: srcChart,
      daXianLayer: srcDaXianLayer,
      liuNianLayer: srcLiuNianLayer,
      liuYueLayer: srcLiuYueLayer,
    };

    /** 固定「当下」：2026-11-06（农历九月廿八） */
    const NOW = new Date(2026, 10, 6);
    const CN_MONTH_NAMES = [
      '正月', '二月', '三月', '四月', '五月', '六月',
      '七月', '八月', '九月', '十月', '冬月', '腊月',
    ];

    await t.test('nextLayerKey：四层循环，且会跳过算不出来的层', () => {
      assert.deepEqual(
        tl.TIME_LAYER_KEYS,
        ['natal', 'daxian', 'liunian', 'liuyue'],
        '时间层顺序应为本命 → 大限 → 流年 → 流月',
      );
      assert.equal(tl.nextLayerKey('natal', 1), 'daxian', '本命的下一层是大限');
      assert.equal(tl.nextLayerKey('liuyue', 1), 'natal', '流月的下一层回到本命');
      assert.equal(tl.nextLayerKey('natal', -1), 'liuyue', '本命的上一层是流月');

      // 算不出来的层要跳过，不能让用户按到一层空白
      const onlyNatalAndLiunian = (k: string) => k === 'natal' || k === 'liunian';
      assert.equal(
        tl.nextLayerKey('natal', 1, onlyNatalAndLiunian),
        'liunian',
        '大限缺失时应跳过到流年',
      );
      assert.equal(
        tl.nextLayerKey('natal', -1, onlyNatalAndLiunian),
        'liunian',
        '流月缺失时应跳到流年',
      );
      assert.equal(
        tl.nextLayerKey('natal', 1, () => false),
        'natal',
        '一层都不可用时应留在原地',
      );
    });

    await t.test('currentLunarOf：取「今天」的农历月，不是出生那天的', () => {
      // 这是一个真 bug 的回归：
      // 流月层一度直接用 chart.lunar.lunarMonth —— 那是**出生时**的农历月。
      // 1990-01-01 生的人农历在腊月，于是标签写成「流月 腊月」，
      // 而用户当下明明在九月 —— 盘面说的是别人的月份。
      const lunar = tl.currentLunarOf({ chart: srcChart }, NOW);
      assert.ok(lunar, 'currentLunarOf 应返回结果');

      // 独立 oracle：直接用历法库换算（不走引擎 chart 那条路径）
      const direct = Solar.fromYmd(2026, 11, 6).getLunar();
      assert.equal(lunar!.year, Number(direct.getYear()), '农历年应与历法库一致');
      assert.equal(lunar!.month, Math.abs(Number(direct.getMonth())), '农历月应与历法库一致');
      assert.equal(lunar!.day, Number(direct.getDay()), '农历日应与历法库一致');

      const birthChart = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      assert.equal(birthChart.lunar.lunarMonth, 12, '1990-01-01 的农历月应为腊月（12）');
      assert.notEqual(
        lunar!.month,
        birthChart.lunar.lunarMonth,
        '测试样本的出生农历月必须与当月不同，否则这条断言没有意义',
      );
    });

    await t.test('buildTimeLayers：四层与源码引擎逐字段一致', () => {
      const c = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      const layers = tl.buildTimeLayers(c, fortuneEngine, { now: NOW });

      /* 大限 */
      const dxPalace = c.palaces.find((p) => p.isCurrentDaXian);
      const dxIndex = dxPalace
        ? c.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch)
        : -1;
      const srcDx = srcDaXianLayer(c, dxIndex)!;
      const dx = layers.daxian;
      assert.ok(dx, '大限层应存在');
      assert.equal(dx!.label, `大限 ${srcDx.label}`, '大限标签应与引擎一致');
      assert.equal(dx!.mingBranch, srcDx.mingBranch, '大限命宫落支应与引擎一致');
      assert.deepEqual(dx!.siHua, srcDx.siHua, '大限四化应与引擎一致');
      assert.deepEqual(dx!.palaces, srcDx.palaces, '大限十二宫应与引擎一致');
      assert.equal(dx!.kind, 'daxian', '大限层的 kind 应是 daxian');

      /* 流年 */
      const srcLn = srcLiuNianLayer(c, 2026);
      const ln = layers.liunian;
      assert.ok(ln, '流年层应存在');
      assert.equal(ln!.label, `流年 ${srcLn.ganzhi} ${srcLn.year}`, '流年标签应与引擎一致');
      assert.equal(ln!.mingBranch, srcLn.mingBranch, '流年命宫落支应与引擎一致');
      assert.deepEqual(ln!.siHua, srcLn.siHua, '流年四化应与引擎一致');
      assert.deepEqual(ln!.palaces, srcLn.palaces, '流年十二宫应与引擎一致');

      /* 流月：月序取当下农历月 */
      const currentMonth = tl.currentLunarOf({ chart: srcChart }, NOW)!.month;
      const srcLy = srcLiuYueLayer(c, 2026, currentMonth);
      const ly = layers.liuyue;
      assert.ok(ly, '流月层应存在');
      assert.equal(ly!.mingBranch, srcLy.mingBranch, '流月命宫落支应与引擎一致');
      assert.deepEqual(ly!.siHua, srcLy.siHua, '流月四化应与引擎一致');
      assert.ok(
        ly!.label.includes(CN_MONTH_NAMES[currentMonth - 1]),
        `流月标签应写当下的农历月（${CN_MONTH_NAMES[currentMonth - 1]}）：${ly!.label}`,
      );
      assert.ok(
        !ly!.label.includes('腊月'),
        '流月标签不该写出生那天的农历月（1990-01-01 是腊月）',
      );
    });

    await t.test('buildTimeLayers：没有端侧引擎时四层全空（降级不崩）', () => {
      const c = srcChart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
      const layers = tl.buildTimeLayers(c, null);
      assert.equal(layers.daxian, null, '没有引擎时大限层应为空');
      assert.equal(layers.liunian, null, '没有引擎时流年层应为空');
      assert.equal(layers.liuyue, null, '没有引擎时流月层应为空');
      assert.equal(layers.natal, null, '本命层不在这套返回值里（它就是原盘）');
    });

    await t.test('fortuneSiHuaOf：运限四化带「限」「流」前缀', () => {
      // 单色绿 HUD 上没有颜色可区分本命四化和运限四化，只能靠前缀。
      const daxian = {
        kind: 'daxian',
        siHua: { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' },
        palaces: [],
      };
      assert.equal(tl.fortuneSiHuaOf('廉贞', daxian), '限禄', '大限化禄应为「限禄」');
      assert.equal(tl.fortuneSiHuaOf('太阳', daxian), '限忌', '大限化忌应为「限忌」');
      assert.equal(tl.fortuneSiHuaOf('紫微', daxian), null, '不是四化星的返回 null');

      const liunian = { kind: 'liunian', siHua: { lu: '天同', quan: '', ke: '', ji: '' }, palaces: [] };
      assert.equal(tl.fortuneSiHuaOf('天同', liunian), '流禄', '流年化禄应为「流禄」');

      const liuyue = { kind: 'liuyue', siHua: { lu: '贪狼', quan: '', ke: '', ji: '' }, palaces: [] };
      assert.equal(tl.fortuneSiHuaOf('贪狼', liuyue), '流禄', '流月化禄应为「流禄」');

      assert.equal(tl.fortuneSiHuaOf('廉贞', null), null, '没有运限层时返回 null');
    });

    await t.test('detectLayer：从问句里认出时间层，认不出就不猜', () => {
      assert.equal(tl.detectLayer('今年整体运势如何'), 'liunian', '「今年」应认出流年');
      assert.equal(tl.detectLayer('这个月怎么样'), 'liuyue', '「这个月」应认出流月');
      assert.equal(tl.detectLayer('我这步大限如何'), 'daxian', '「大限」应认出大限');
      assert.equal(tl.detectLayer('回到本命盘'), 'natal', '「本命」应认出本命');
      assert.equal(tl.detectLayer('今天天气怎么样'), null, '认不出来返回 null，绝不猜');
      assert.equal(tl.detectLayer(''), null, '空串返回 null');
    });

    await t.test('focusFromQuestion：问题里说了就听问题的，没说就跟当前层', () => {
      assert.deepEqual(
        tl.focusFromQuestion('今年怎么样', 'natal'),
        { time: 'liunian' },
        '问题说「今年」→ 流年焦点',
      );
      assert.deepEqual(
        tl.focusFromQuestion('大限呢', 'natal'),
        { time: 'daxian' },
        '问题说「大限」→ 大限焦点',
      );
      assert.deepEqual(
        tl.focusFromQuestion('随便聊聊', 'liunian'),
        { time: 'liunian' },
        '没说就跟当前层（用户正在看的就是他要问的）',
      );
      assert.deepEqual(
        tl.focusFromQuestion('随便聊聊', 'daxian'),
        { time: 'daxian' },
        '没说就跟当前层',
      );
      assert.equal(tl.focusFromQuestion('随便聊聊', 'natal'), null, '都没说就不给焦点');
      assert.equal(
        tl.focusFromQuestion('随便聊聊', 'liuyue'),
        null,
        '后端只认流年/大限两种焦点，流月不给焦点',
      );
    });

    await t.test('fortuneSiHuaText：运限四化摘要（中宫一行）', () => {
      const layer = { siHua: { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' } };
      assert.equal(
        tl.fortuneSiHuaText(layer),
        '禄廉贞　权破军　科武曲　忌太阳',
        '四化摘要应四段齐全',
      );
      assert.equal(tl.fortuneSiHuaText(null), '', '没有运限层时返回空串');
    });
  }

  /* ---------------------------------------------------------------- *
   * F. index.ink —— 界面文案契约
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(INK_PAGE)) {
    t.skip('眼镜端界面文案契约（F 组全部用例）', `缺少 ${path.relative(REPO_ROOT, INK_PAGE)}`);
  } else {
    const ink = fs.readFileSync(INK_PAGE, 'utf8');

    await t.test('界面文案不得承诺没实现的交互', () => {
      // 工程里**没有任何 tap / dblclick 处理**，文案却写着「单击」「双击」——
      // 用户按了没反应，这是失效承诺，比没有提示更糟。
      assert.ok(!ink.includes('单击'), '界面文案不该出现「单击」（工程没有 tap 处理）');
      assert.ok(!ink.includes('双击'), '界面文案不该出现「双击」（工程没有双击处理）');
      // 实际实现的交互要写清楚
      assert.ok(ink.includes('确认键'), '界面应写明确认键的用法');
      assert.ok(ink.includes('返回键'), '界面应写明返回键的用法');
    });

    await t.test('时间层接线完整（上下键切层 + 运限层渲染）', () => {
      // 只写规范不写代码 = 装饰。这里盯住接线点真的在页面里。
      for (const needle of [
        '_cycleLayer',
        '_verticalIsLayer',
        'buildTimeLayers',
        'fortuneShort',
        'layerTitle',
      ]) {
        assert.ok(ink.includes(needle), `index.ink 里应有「${needle}」的接线`);
      }
    });

    await t.test('首启兜底接线完整（示例盘 + 重新说生辰入口）', () => {
      // 模拟器没有麦克风 → 页面必须能自己亮出一张盘；
      // 盘面态也必须留得住「重新说生辰」的入口，否则语音失败一次就锁死。
      for (const needle of [
        'resolveInitialBirth',
        'birth-source.js',
        'demoLabel',
        '_openInput',
      ]) {
        assert.ok(ink.includes(needle), `index.ink 里应有「${needle}」的接线`);
      }
      // 出生参数解析只允许有一个来源，否则两份校验迟早会跑偏
      assert.ok(!ink.includes('_resolveBirth'), '出生参数解析应只有 lib/birth-source.js 一个来源');
    });

    await t.test('镜腿输入接线完整（GlobalHook / 双向事件 / 统一入口）', () => {
      // 这几条是真机交互失效的根，钉死它们不被悄悄改回去：
      for (const needle of [
        'temple-input.js',
        'createInputRouter',
        'normalizeKey',
        'rawKeyLabel',
        'onKeyDown',
        'onKeyUp',
        '_feedKey',
        '_dispatchKey',
      ]) {
        assert.ok(ink.includes(needle), `index.ink 里应有「${needle}」的接线`);
      }
      // 旧的「同 code 150ms 去抖」闸门已被镜腿输入契约取代
      assert.ok(!ink.includes('shouldAcceptKey'), '不应再直接调用 key-guard 的同码去抖');
      assert.ok(!ink.includes('_keyGuard'), '不应再保留 _keyGuard 状态');
    });

    await t.test('所有分支之前就接管默认行为（preventDefault 必须在最前）', () => {
      // 官方默认行为：Backspace 关应用 / 方向键滚根视图 / Enter 进导航模式。
      // 只要漏掉一次，浮层态按返回键就会连应用一起退掉。
      const upIdx = ink.indexOf('onKeyUp(event)');
      assert.ok(upIdx > 0, '应能找到 onKeyUp');
      const feedIdx = ink.indexOf('_feedKey(event,', upIdx);
      assert.ok(feedIdx > upIdx, 'onKeyUp 应把事件交给统一入口');
      const guardIdx = ink.indexOf('preventDefault', feedIdx);
      assert.ok(guardIdx > feedIdx, 'preventDefault 应在统一入口里');
      // 统一入口里，preventDefault 必须在归一化之后、分发之前
      const normIdx = ink.indexOf('normalizeKey(event)', feedIdx);
      assert.ok(normIdx > feedIdx && normIdx < guardIdx, '先归一化，再接管默认行为');
      const dispatchIdx = ink.indexOf('_dispatchKey(emitted)', feedIdx);
      assert.ok(dispatchIdx > guardIdx, '接管默认行为之后才分发动作');
    });

    await t.test('录入浮层的返回键不退出应用（已有盘时回盘面）', () => {
      assert.ok(ink.includes('_closeInput'), '应走 _closeInput 而不是直接 finish()');
      const closeIdx = ink.indexOf('_closeInput() {');
      assert.ok(closeIdx > 0, '应能找到 _closeInput');
      const seg = ink.slice(closeIdx, closeIdx + 700);
      assert.ok(seg.includes('_chartJson'), '判据应是「有没有盘」（_chartJson）');
      assert.ok(seg.includes('this.finish()'), '没有盘时才退出应用');
    });
  }

  /* ---------------------------------------------------------------- *
   * G. temple-input.js —— 镜腿输入契约（真机 GlobalHook / 方向键时序）
   *
   * 为什么这组必须是回归：镜腿上的按键**不是标准键盘**。
   * · GlobalHook 是 Rokid Glasses 专属键值（= 触摸镜腿按键），
   *   页面不认它 ⇒ 唯一的确认动作彻底失灵；
   * · 一次滑动 = 先 GlobalHook、50~120ms 后才来方向键，
   *   把 GlobalHook 当点按就会「移动 + 确认」一起触发；
   * · 宿主可能一次物理操作同时报 keydown 和 keyup。
   *
   * 这些结论来自真机实测（见 DEVICE-CHECKLIST §3），
   * 源码里推不出来，只能钉死。
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(TEMPLE_INPUT_MODULE)) {
    t.skip('镜腿输入契约（G 组全部用例）', `缺少 ${path.relative(REPO_ROOT, TEMPLE_INPUT_MODULE)}`);
  } else {
    const ti = await loadModule<{
      ACTION: Record<string, string>;
      TEMPLE_DEFAULTS: {
        settleMs: number;
        cooldownMs: number;
        repeatWindowMs: number;
        upPairWindowMs: number;
        upEchoMs: number;
      };
      normalizeKey(event: unknown): string | null;
      rawKeyLabel(event: unknown): string;
      createInputRouter(opts?: Record<string, unknown>): {
        feed(action: string, phase: 'down' | 'up'): string | null;
        hasPendingTemple(): boolean;
        cancel(): void;
      };
    }>(TEMPLE_INPUT_MODULE);

    const A = ti.ACTION;

    await t.test('归一化：标准键值 → 页面动作', () => {
      assert.equal(ti.normalizeKey({ code: 'ArrowUp' }), A.UP);
      assert.equal(ti.normalizeKey({ code: 'ArrowDown' }), A.DOWN);
      assert.equal(ti.normalizeKey({ code: 'ArrowLeft' }), A.LEFT);
      assert.equal(ti.normalizeKey({ code: 'ArrowRight' }), A.RIGHT);
      assert.equal(ti.normalizeKey({ code: 'Enter' }), A.CONFIRM);
      assert.equal(ti.normalizeKey({ code: 'Backspace' }), A.BACK);
    });

    await t.test('归一化：GlobalHook 是 Rokid Glasses 的镜腿按键', () => {
      assert.equal(ti.normalizeKey({ code: 'GlobalHook' }), A.TEMPLE);
    });

    await t.test('归一化：code 缺失时用 key / keyCode 兜底', () => {
      assert.equal(ti.normalizeKey({ key: 'ArrowLeft' }), A.LEFT);
      assert.equal(ti.normalizeKey({ key: 'Up' }), A.UP);
      assert.equal(ti.normalizeKey({ keyCode: 37 }), A.LEFT);
      assert.equal(ti.normalizeKey({ keyCode: 13 }), A.CONFIRM);
      assert.equal(ti.normalizeKey({ keyCode: 8 }), A.BACK);
    });

    await t.test('归一化：认不出来的键返回 null（不产生动作）', () => {
      assert.equal(ti.normalizeKey({ code: 'KeyQ' }), null);
      assert.equal(ti.normalizeKey({}), null);
      assert.equal(ti.normalizeKey(null), null);
    });

    await t.test('原始键值可见（真机自证 DEVICE-CHECKLIST §1.5 T2）', () => {
      assert.equal(ti.rawKeyLabel({ code: 'GlobalHook' }), 'GlobalHook');
      assert.equal(ti.rawKeyLabel({ key: 'ArrowLeft' }), 'ArrowLeft');
      assert.equal(ti.rawKeyLabel({ keyCode: 37 }), '37');
      assert.equal(ti.rawKeyLabel(null), '');
    });

    await t.test('滑动 = GlobalHook 先到、方向键后到 ⇒ 只出方向键、不确认', async () => {
      const got: string[] = [];
      const router = ti.createInputRouter({ onAction: (a: string) => got.push(a) });
      router.feed(A.TEMPLE, 'down');
      await sleep(80);
      const emitted = router.feed(A.LEFT, 'down');
      await sleep(ti.TEMPLE_DEFAULTS.settleMs + 120);
      assert.equal(emitted, A.LEFT, '方向键应立即生效');
      assert.deepEqual(got, [], '滑动不应产生确认');
    });

    await t.test('点按 = 只有 GlobalHook ⇒ 延迟后确认一次', async () => {
      const got: string[] = [];
      const router = ti.createInputRouter({ onAction: (a: string) => got.push(a) });
      router.feed(A.TEMPLE, 'down');
      assert.deepEqual(got, [], '挂起期间不能立刻确认');
      await sleep(ti.TEMPLE_DEFAULTS.settleMs + 120);
      assert.deepEqual(got, [A.CONFIRM], '挂起窗口过后确认一次');
    });

    await t.test('按下 + 抬起配对 ⇒ 只执行一次', () => {
      const got: string[] = [];
      const router = ti.createInputRouter({ onAction: (a: string) => got.push(a) });
      const down = router.feed(A.CONFIRM, 'down');
      const up = router.feed(A.CONFIRM, 'up');
      assert.equal(down, A.CONFIRM);
      assert.equal(up, null, '配对的抬起不再执行');
      assert.deepEqual(got, []);
    });

    await t.test('宿主只报 keyup（没有配对的 down）⇒ 照样执行', () => {
      const router = ti.createInputRouter({});
      assert.equal(router.feed(A.LEFT, 'up'), A.LEFT);
    });

    await t.test('滑动抖动（短时间连报同键 down）⇒ 只执行一次', () => {
      const router = ti.createInputRouter({});
      assert.equal(router.feed(A.LEFT, 'down'), A.LEFT);
      assert.equal(router.feed(A.LEFT, 'down'), null, '抖动应被丢弃');
    });

    await t.test('同一次点按走两条通道（GlobalHook + Enter）⇒ 只确认一次', async () => {
      const got: string[] = [];
      const router = ti.createInputRouter({ onAction: (a: string) => got.push(a) });
      router.feed(A.TEMPLE, 'down');
      await sleep(ti.TEMPLE_DEFAULTS.settleMs + 80);
      router.feed(A.CONFIRM, 'up');
      await sleep(ti.TEMPLE_DEFAULTS.cooldownMs + 80);
      assert.equal(got.filter((a) => a === A.CONFIRM).length, 1, '回声只能确认一次');
    });

    await t.test('用户连点两次确认（间隔超过冷却）⇒ 两次都要生效', async () => {
      const got: string[] = [];
      const router = ti.createInputRouter({ onAction: (a: string) => got.push(a) });
      router.feed(A.TEMPLE, 'down');
      await sleep(ti.TEMPLE_DEFAULTS.settleMs + 60);
      await sleep(ti.TEMPLE_DEFAULTS.cooldownMs + 120);
      router.feed(A.TEMPLE, 'down');
      await sleep(ti.TEMPLE_DEFAULTS.settleMs + 120);
      assert.equal(got.filter((a) => a === A.CONFIRM).length, 2, '真实连点不能被吞');
    });

    await t.test('方向键真实连按（间隔 250ms）⇒ 两次都要生效', async () => {
      const router = ti.createInputRouter({});
      assert.equal(router.feed(A.LEFT, 'up'), A.LEFT);
      await sleep(250);
      assert.equal(router.feed(A.LEFT, 'up'), A.LEFT, '同键连按不该被回声窗口吞掉');
    });
  }

  /* ---------------------------------------------------------------- *
   * H. birth-source.js —— 出生参数三级兜底（入参 → 存档 → 内置示例）
   *
   * 为什么这组必须有：模拟器没有麦克风，语音录入走不通，
   * 页面之前永远停在「说出你的生辰」浮层、盘面一次都出不来。
   * 第三级（内置示例盘）就是为此存在的，必须钉死它的边界。
   * ---------------------------------------------------------------- */
  if (!fs.existsSync(BIRTH_SOURCE_MODULE)) {
    t.skip('出生参数三级兜底（H 组全部用例）', `缺少 ${path.relative(REPO_ROOT, BIRTH_SOURCE_MODULE)}`);
  } else {
    interface BirthLike {
      year: number;
      month: number;
      day: number;
      hour: number;
      gender: string;
      name?: string;
    }
    const bs = await loadModule<{
      DEMO_BIRTH: BirthLike;
      birthFromQuery: (query?: unknown) => BirthLike | null;
      resolveInitialBirth: (
        query?: unknown,
        saved?: BirthLike | null,
      ) => { birth: BirthLike; demo: boolean };
    }>(BIRTH_SOURCE_MODULE);

    const pick = (b: BirthLike) => ({
      year: b.year,
      month: b.month,
      day: b.day,
      hour: b.hour,
      gender: b.gender,
    });

    await t.test('对话流入参优先，且不标记为示例盘', () => {
      const r = bs.resolveInitialBirth({ year: 1988, month: 3, day: 12, hour: 7, gender: 'female' }, null);
      assert.equal(r.demo, false, '有入参就不该是示例盘');
      assert.deepEqual(pick(r.birth), {
        year: 1988,
        month: 3,
        day: 12,
        hour: 7,
        gender: 'female',
      });
    });

    await t.test('入参非法时回落本机存档，仍不是示例盘', () => {
      const saved = { year: 1975, month: 6, day: 6, hour: 3, gender: 'male' };
      const r = bs.resolveInitialBirth({ year: 1899, hour: 99 }, saved);
      assert.equal(r.demo, false, '有存档就不该是示例盘');
      assert.deepEqual(pick(r.birth), {
        year: 1975,
        month: 6,
        day: 6,
        hour: 3,
        gender: 'male',
      });
    });

    await t.test('入参与存档都没有时，回落到内置示例盘', () => {
      const r = bs.resolveInitialBirth(undefined, null);
      assert.equal(r.demo, true, '既无入参又无存档时必须标记为示例盘');
      assert.deepEqual(pick(r.birth), {
        year: 1990,
        month: 1,
        day: 1,
        hour: 0,
        gender: 'male',
      });
    });

    await t.test('示例盘是冻结对象，调用方改不动', () => {
      assert.equal(Object.isFrozen(bs.DEMO_BIRTH), true, '示例盘必须冻结，防止被就地改写');
    });

    await t.test('时辰序号边界：0 与 11 合法，越界非法', () => {
      assert.ok(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' }));
      assert.ok(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 11, gender: 'male' }));
      assert.equal(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 12, gender: 'male' }), null);
      assert.equal(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: -1, gender: 'male' }), null);
    });

    await t.test('性别只认 male / female', () => {
      assert.equal(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 0, gender: 'other' }), null);
      assert.equal(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 0 }), null);
      assert.ok(bs.birthFromQuery({ year: 1990, month: 1, day: 1, hour: 0, gender: 'female' }));
    });

    await t.test('年 / 月 / 日边界与端侧口径一致', () => {
      assert.equal(bs.birthFromQuery({ year: 1899, month: 1, day: 1, hour: 0, gender: 'male' }), null);
      assert.equal(bs.birthFromQuery({ year: 2101, month: 1, day: 1, hour: 0, gender: 'male' }), null);
      assert.equal(bs.birthFromQuery({ year: 1990, month: 13, day: 1, hour: 0, gender: 'male' }), null);
      assert.equal(bs.birthFromQuery({ year: 1990, month: 1, day: 32, hour: 0, gender: 'male' }), null);
      assert.ok(bs.birthFromQuery({ year: 1900, month: 12, day: 31, hour: 0, gender: 'male' }));
      assert.ok(bs.birthFromQuery({ year: 2100, month: 12, day: 31, hour: 0, gender: 'male' }));
    });

    await t.test('示例盘不会被当成用户自己的盘读回来', () => {
      // 示例盘不进本机命盘库，所以下一次启动 resolveInitialBirth 拿到的 saved 仍是 null，
      // 仍然回落到示例盘 —— 而不是「用户上次的那张盘」。
      const first = bs.resolveInitialBirth(undefined, null);
      assert.equal(first.demo, true);
      const second = bs.resolveInitialBirth(undefined, null);
      assert.equal(second.demo, true);
      assert.deepEqual(pick(second.birth), pick(first.birth), '示例盘必须可复现');
    });
  }
};

export default suite;

/**
 * 独立运行：
 *
 *   npx tsx tests/rokid_agent.test.ts
 */
if (isMainModule(import.meta.url)) {
  await runStandalone(suite, '眼镜智能体回归');
}
