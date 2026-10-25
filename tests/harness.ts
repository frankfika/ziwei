/**
 * 极简测试框架（零依赖）。
 *
 * 为什么不用 jest/vitest：
 *   回归套件是 CI 的守门人，依赖越少越不容易被上游事件拖垮。
 *   node:assert + node:util 就够了。
 *
 * 用法：
 *   export const suite = async (t: Tester) => {
 *     await t.test('某个断言', () => { assert.equal(1, 1); });
 *     t.skip('需要数据的用例', '原因：data/index 不存在');
 *   };
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 一个失败用例 */
export interface TestFailure {
  /** 用例名 */
  name: string;
  /** 抛出的错误 */
  error: unknown;
}

/** 一个被跳过的用例 */
export interface SkipEntry {
  /** 用例名 */
  name: string;
  /** 跳过原因（必须写清为什么） */
  reason: string;
}

/** 套件函数签名 */
export type SuiteFn = (t: Tester) => void | Promise<void>;

/**
 * 用例收集器。
 *
 * 用例**不中断**执行：一个失败不影响后续用例继续跑，
 * 这样一轮跑完能看到全部问题，而不是修一个跑一次。
 */
export class Tester {
  /** 通过的用例名 */
  readonly passed: string[] = [];
  /** 失败的用例 */
  readonly failures: TestFailure[] = [];
  /** 跳过的用例 */
  readonly skipped: SkipEntry[] = [];

  constructor(readonly suite: string) {}

  /** 跑一个用例；失败只记录，不抛 */
  async test(name: string, fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
      this.passed.push(name);
    } catch (error) {
      this.failures.push({ name, error });
    }
  }

  /**
   * 跳过一个用例。
   *
   * 只在「环境缺条件」时使用（例如数据集没下载）。
   * 断言失败**不允许** skip —— 那等于把回归网撤掉。
   */
  skip(name: string, reason: string): void {
    this.skipped.push({ name, reason });
  }

  /** 用例总数（通过 + 失败 + 跳过） */
  get total(): number {
    return this.passed.length + this.failures.length + this.skipped.length;
  }
}

/** 把任意错误转成可读文本 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * 判断当前文件是不是「被直接执行」的入口文件。
 *
 * 测试文件既可能被 tests/run.ts 导入，也可能被单独 npx tsx 跑
 * （例如刷新金标准快照）。这个判断让两种模式共存。
 */
export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(path.resolve(entry)).href === metaUrl;
  } catch {
    return false;
  }
}

/**
 * 独立运行一个 suite（被直接执行时用）：打印结果，失败则退出码非 0。
 */
export async function runStandalone(suite: SuiteFn, label = '测试'): Promise<void> {
  const t = new Tester(label);
  await suite(t);

  console.log('');
  for (const name of t.passed) console.log(`  ✓ ${name}`);
  for (const s of t.skipped) console.log(`  ○ ${s.name}  —— 跳过：${s.reason}`);
  for (const f of t.failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(describeError(f.error));
  }
  console.log('');
  console.log(`通过 ${t.passed.length} / 失败 ${t.failures.length} / 跳过 ${t.skipped.length}`);
  process.exit(t.failures.length > 0 ? 1 : 0);
}
