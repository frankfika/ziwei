/**
 * 眼镜端首启回归 —— 挂进回归套件。
 *
 * 为什么必须挂进 `npm test`：
 *   「打开就有盘」这件事**没有任何命令守着**。之前页面在拿不到出生信息时只能停在
 *   「说出你的生辰」浮层 —— 模拟器没有麦克风，于是模拟器里盘面一次都出不来，
 *   而这件事不会让任何现有测试变红（单测测的是纯函数，测不到页面首屏）。
 *
 *   这个文件把**真实页面逻辑**跑一遍：直接加载 `.ink` 的 `<script setup>`，
 *   配一个最小 Ink 运行时，调真实的 `onLoad`，断言首屏真的排出了盘。
 *   命令与 `apps/rokid-agent/scripts/simulate-first-launch.mjs` 是同一条，
 *   跟开发者本地跑的完全是同一件事。
 *
 * 它守住的四件事：
 *   1. 首启必须出盘（12 宫），不能停在输入浮层；
 *   2. **端侧引擎真的能加载**（assets/engine.js 动态 import）→ 中宫显示「端侧计算」；
 *      这条以前是「不知道」，现在是被断言钉死的；
 *   3. 四层运限可用（运限层要靠端侧引擎算，服务端兜底路径算不出来）；
 *   4. 盘面态的返回键能回到生辰录入 —— 否则语音失败一次用户就被锁死在第一张盘上。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'apps/rokid-agent/scripts/simulate-first-launch.mjs');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runSimulator(extraArgs: string[] = []): RunResult {
  try {
    const stdout = execFileSync('node', [SCRIPT, '--no-png', ...extraArgs], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export const suite: SuiteFn = async (t) => {
  await t.test('冷启动能出盘（12 宫），且不是停在「说出你的生辰」', () => {
    const r = runSimulator();
    const all = `${r.stdout}\n${r.stderr}`;
    if (r.code !== 0) {
      throw new Error(`首启模拟退出码 ${r.code}\n${all}`);
    }
    if (!/首屏状态\s*:\s*ready=true/.test(r.stdout)) {
      throw new Error(`首屏没有 ready=true\n${r.stdout}`);
    }
    if (!/盘面\s*:\s*12 宫/.test(r.stdout)) {
      throw new Error(`盘面不是 12 宫\n${r.stdout}`);
    }
    if (!/浮层=（无）/.test(r.stdout)) {
      throw new Error(`首屏仍停在浮层里\n${r.stdout}`);
    }
  });

  await t.test('端侧引擎真的加载成功（不是静默回落服务端）', () => {
    const r = runSimulator();
    if (!/计算来源\s*:\s*端侧计算/.test(r.stdout)) {
      throw new Error(`端侧引擎没加载上\n${r.stdout}\n${r.stderr}`);
    }
    if (!/运限层可用\s*:\s*true/.test(r.stdout)) {
      throw new Error(`四层运限不可用\n${r.stdout}\n${r.stderr}`);
    }
  });

  await t.test('首启是示例盘且界面有标注；带入参则不是示例盘', () => {
    const cold = runSimulator();
    if (!/示例盘标注\s*:\s*示例盘/.test(cold.stdout)) {
      throw new Error(`冷启动没有标注示例盘\n${cold.stdout}`);
    }

    const withQuery = runSimulator([
      '--query',
      'year=1988&month=3&day=12&hour=7&gender=female',
    ]);
    if (withQuery.code !== 0) {
      throw new Error(`带入参路径退出码 ${withQuery.code}\n${withQuery.stdout}\n${withQuery.stderr}`);
    }
    if (!/示例盘标注\s*:\s*（无）/.test(withQuery.stdout)) {
      throw new Error(`带入参却被当成示例盘\n${withQuery.stdout}`);
    }
  });

  await t.test('盘面态的返回键能回到生辰录入（重新说生辰的唯一入口）', () => {
    const r = runSimulator();
    if (!/返回键→生辰录入\s*:\s*可达 ✓/.test(r.stdout)) {
      throw new Error(`返回键回不到生辰录入\n${r.stdout}\n${r.stderr}`);
    }
  });

  /**
   * 语音路径（`--asr` 桩）：说完生辰 → 解析 → 排盘 → **关掉录入浮层**。
   *
   * ⚠️ 这条路径以前**从没被任何测试跑到过** —— 模拟器没有麦克风，
   * 于是「解析成功后浮层没关」这个致命 bug 一直没人看见：
   * 用户说完生辰 → 排盘成功 → 录入浮层还盖在盘面上 →
   * 而浮层态按返回键是**退出应用** ⇒ 用户永远看不到自己刚排出来的盘。
   */
  await t.test('语音说完生辰后能回到盘面（录入浮层必须关掉）', () => {
    const r = runSimulator(['--asr', '1990年1月1日 早上 男']);
    if (r.code !== 0) {
      throw new Error(`语音路径退出码 ${r.code}\n${r.stdout}\n${r.stderr}`);
    }
    if (!/识别后浮层\s*:\s*（无）\s*✓ 已回到盘面/.test(r.stdout)) {
      throw new Error(`说完生辰后仍停在录入浮层\n${r.stdout}\n${r.stderr}`);
    }
    if (!/识别后宫位\s*:\s*12/.test(r.stdout)) {
      throw new Error(`语音识别后排盘格子不是 12\n${r.stdout}\n${r.stderr}`);
    }
  });

  await t.test('缺时辰时按午时兜底，并在盘面上明示「时辰按午时估算」', () => {
    const r = runSimulator(['--asr', '1990年1月1日 我不知道时辰 男']);
    if (r.code !== 0) {
      throw new Error(`缺时辰路径退出码 ${r.code}\n${r.stdout}\n${r.stderr}`);
    }
    if (!/识别后标注\s*:\s*时辰按午时估算/.test(r.stdout)) {
      throw new Error(`缺时辰时没有标注估算\n${r.stdout}\n${r.stderr}`);
    }
  });
};
