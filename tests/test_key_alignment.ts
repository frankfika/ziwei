/**
 * 键口径校验的**独立运行入口**（保留旧路径，兼容 docs/ARCHITECTURE.md 与
 * packages/reading-index/src/key.ts 里的引用）。
 *
 *   npx tsx tests/test_key_alignment.ts
 *
 * 实现放在 tests/test_key_alignment.test.ts（进 npm test 整套），
 * 这里只做「单独跑 + 打印报告 + 非零退出码」。
 *
 * ⚠️ 输出格式是**对外契约**：scripts/acceptance.sh 会 grep 这里的
 *    「样本总数 / 口径A / 口径B / PASS」标记，改格式要同步改那边。
 */

import { Tester, describeError } from './harness';
import { suite, keyAlignmentStats } from './test_key_alignment.test';

const t = new Tester('键口径校验');
await suite(t);

console.log('');
for (const name of t.passed) console.log(`  ✓ ${name}`);
for (const s of t.skipped) console.log(`  ○ ${s.name}  —— 跳过：${s.reason}`);
for (const f of t.failures) {
  console.log(`  ✗ ${f.name}`);
  console.log(describeError(f.error));
}

const st = keyAlignmentStats;

if (st.skipped) {
  console.log('');
  console.log('样本总数        : 0（无数据集，键口径无法校验）');
  console.log('SKIP — 没有数据集，键口径校验跳过');
} else {
  const total = st.total || 1;
  console.log('');
  console.log(`样本总数        : ${st.total}`);
  console.log(
    `口径A 直排匹配  : ${st.directHit}  (${((st.directHit / total) * 100).toFixed(2)}%)`,
  );
  console.log(
    `口径B 次日匹配  : ${st.shiftedOnlyHit}  (${((st.shiftedOnlyHit / total) * 100).toFixed(2)}%)`,
  );
  console.log(`不匹配          : ${st.total - st.directHit}`);
  console.log(
    `（参考）口径B 巧合同星 : ${st.shiftedCoincidence}  —— 两次排盘恰好同主星，不构成口径证据`,
  );
  if (st.mismatches.length) {
    console.log('\n不匹配样例:');
    st.mismatches.forEach((m) => console.log(m));
  }

  const pass = st.directHit === st.total && st.shiftedOnlyHit === 0;
  console.log(
    `\n${pass ? '✅ PASS' : '❌ FAIL'} — 键口径判定: ${
      pass ? '直排口径（key 的 y/m/d/h 即引擎输入）' : '需人工复核'
    }`,
  );
}

console.log('');
console.log(`通过 ${t.passed.length} / 失败 ${t.failures.length} / 跳过 ${t.skipped.length}`);
process.exit(t.failures.length > 0 ? 1 : 0);
