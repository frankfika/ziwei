/**
 * 统一测试入口 —— `npm test` → `tsx tests/run.ts`。
 *
 * 规则：
 *  · 依次跑所有测试文件
 *  · 每个文件打印通过/失败/跳过摘要与耗时
 *  · 任一失败 → 进程退出码非 0
 *  · 最后打印总览（几个文件、几个用例、耗时）
 *
 * 零依赖：只用 node:assert / node:util，不装 jest / vitest。
 */

import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Tester, describeError, type SuiteFn } from './harness';

/** 仓库根目录 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 参与整套回归的测试文件（顺序即执行顺序） */
const SUITE_FILES = [
  'tests/smoke.test.ts',
  'tests/golden.test.ts',
  'tests/determinism.test.ts',
  'tests/boundary.test.ts',
  'tests/test_key_alignment.test.ts',
  'tests/index_integrity.test.ts',
  'tests/service.test.ts',
  'tests/ask_quota.test.ts',
  'tests/account.test.ts',
  'tests/quota_copy.test.ts',
];

/** 一个文件跑完的结果 */
interface FileResult {
  file: string;
  tester: Tester;
  ms: number;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

/** 跑一个测试文件 */
async function runFile(file: string): Promise<FileResult> {
  const t0 = performance.now();
  const tester = new Tester(file);

  try {
    const mod = (await import(path.join(REPO_ROOT, file))) as {
      suite?: SuiteFn;
      default?: SuiteFn;
    };
    const suite = mod.suite ?? mod.default;
    if (!suite) throw new Error(`${file} 没有导出 suite`);
    await suite(tester);
  } catch (error) {
    tester.failures.push({ name: '（文件加载/执行崩溃）', error });
  }

  return { file, tester, ms: performance.now() - t0 };
}

async function main(): Promise<void> {
  const started = performance.now();

  console.log('紫微助手 · 回归测试套件');
  console.log('='.repeat(68));

  const results: FileResult[] = [];

  for (const file of SUITE_FILES) {
    console.log(`\n▶ ${file}`);
    const result = await runFile(file);
    results.push(result);

    for (const name of result.tester.passed) {
      console.log(`  ✓ ${name}`);
    }
    for (const s of result.tester.skipped) {
      console.log(`  ○ ${s.name}  —— 跳过：${s.reason}`);
    }
    for (const f of result.tester.failures) {
      console.log(`  ✗ ${f.name}`);
    }
    console.log(
      `  ── 结果: ${result.tester.passed.length} 通过 / ${result.tester.failures.length} 失败 ` +
        `/ ${result.tester.skipped.length} 跳过 · ${fmtMs(result.ms)}`,
    );
  }

  const totalPassed = results.reduce((s, r) => s + r.tester.passed.length, 0);
  const totalFailed = results.reduce((s, r) => s + r.tester.failures.length, 0);
  const totalSkipped = results.reduce((s, r) => s + r.tester.skipped.length, 0);
  const totalCases = totalPassed + totalFailed + totalSkipped;
  const totalMs = performance.now() - started;

  console.log('');
  console.log('='.repeat(68));
  console.log('总览');
  console.log(`  测试文件: ${results.length}`);
  console.log(`  用例总数: ${totalCases}（${totalPassed} 通过 / ${totalFailed} 失败 / ${totalSkipped} 跳过）`);
  console.log(`  总耗时  : ${fmtMs(totalMs)}`);
  console.log('');

  for (const r of results) {
    const flag = r.tester.failures.length > 0 ? '✗' : '✓';
    console.log(
      `  ${flag} ${r.file.padEnd(38)} ${String(r.tester.passed.length).padStart(3)} 通过 ` +
        `${String(r.tester.failures.length).padStart(3)} 失败 ` +
        `${String(r.tester.skipped.length).padStart(3)} 跳过 · ${fmtMs(r.ms)}`,
    );
  }

  if (totalFailed > 0) {
    console.log('');
    console.log('='.repeat(68));
    console.log('失败详情');
    for (const r of results) {
      if (r.tester.failures.length === 0) continue;
      console.log(`\n▶ ${r.file}`);
      for (const f of r.tester.failures) {
        console.log(`  ✗ ${f.name}`);
        console.log(
          describeError(f.error)
            .split('\n')
            .map((line) => `      ${line}`)
            .join('\n'),
        );
      }
    }
  }

  console.log('');
  console.log('='.repeat(68));
  console.log(totalFailed === 0 ? '✅ 全部通过' : `❌ ${totalFailed} 个用例失败`);
  process.exit(totalFailed === 0 ? 0 : 1);
}

await main();
