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
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DIMENSION_LABELS,
  READING_DIMENSIONS,
  chart as srcChart,
  chartSummary as srcChartSummary,
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
  formatStar: (star: { name: string; siHua?: string }) => string;
  buildCell: (palace: unknown) => PalaceCell;
  buildBoard: (chart: unknown) => { cells: PalaceCell[]; center: Record<string, unknown> };
  cellAt: (cells: PalaceCell[], branch: number) => PalaceCell | null;
  stepBranch: (branch: number, delta: number) => number;
  branchAt: (row: number, col: number) => number | null;
  neighborBranch: (branch: number, dx: number, dy: number) => number;
  markActive: (cells: PalaceCell[], branch: number) => PalaceCell[];
  dimensionOfPalace: (palaceName: string) => string | null;
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
}

interface BirthParserModule {
  HOUR_BY_NAME: Record<string, number>;
  HOUR_BY_LABEL: Record<string, number>;
  HOUR_BY_PERIOD: Record<string, number>;
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
      ] as const;
      const missing = need.filter((k) => typeof (bundle as unknown as Record<string, unknown>)[k] !== 'function');
      assert.deepEqual(
        missing,
        [],
        `打包产物缺少导出：${missing.join(', ')}（眼镜端 chart-source.js 会直接崩）`,
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
      const expected: Record<string, string> = {
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

    await t.test('缺时辰 → 返回 null', () => {
      assert.equal(
        parser.parseBirthFromSpeech('1990年1月1日 男'),
        null,
        '缺时辰时不该猜一个时辰，应返回 null 让用户补',
      );
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
