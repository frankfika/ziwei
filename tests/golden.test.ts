/**
 * 金标准盘快照 —— **本项目最重要的回归网**。
 *
 * 契约：
 *  · 快照文件在 tests/golden/*.json，**必须进 git**（它们是回归基线）。
 *  · 快照**不依赖数据集**：纯引擎重算即可比对，所以 CI 没有 56GB 数据也能跑。
 *  · 快照排除随时间变化的字段（currentAge / isCurrentDaXian）——
 *    这两个由 iztro 按「今天」算，放进去快照会自己过期。
 *  · 引擎升级若**有意**改盘：先跑
 *        ZIWEI_UPDATE_GOLDEN=1 npx tsx tests/golden.test.ts
 *    人工 review git diff 之后再提交。忘记 review 就提交 = 把回归网撤了。
 */

import assert from 'node:assert/strict';

import { chart } from '@ziwei/chart-engine';
import { lunarToSolar } from '@ziwei/chart-engine/engine/lunar-solar.ts';

import type { Tester } from './harness';
import { isMainModule, runStandalone } from './harness';
import {
  GOLDEN_CASES,
  buildGoldenFile,
  diffSnapshot,
  formatDiffs,
  readGoldenFile,
  snapshotFor,
  writeGoldenFile,
} from './fixtures/golden';

/** 是否处于「刷新快照」模式 */
const UPDATE = process.env.ZIWEI_UPDATE_GOLDEN === '1';

export const suite = async (t: Tester): Promise<void> => {
  await t.test('金标准用例数 ≥ 5', () => {
    assert.ok(
      GOLDEN_CASES.length >= 5,
      `金标准用例只有 ${GOLDEN_CASES.length} 条，要求 ≥ 5 条`,
    );
  });

  await t.test('金标准用例 id 唯一', () => {
    const ids = new Set(GOLDEN_CASES.map((c) => c.id));
    assert.equal(ids.size, GOLDEN_CASES.length, '金标准用例 id 有重复');
  });

  await t.test('金标准用例覆盖到要求的边界点', () => {
    const all = GOLDEN_CASES.flatMap((c) => c.covers);
    const need = [
      ['时辰边界·子时(0)', '子时'],
      ['时辰边界·丑时(1)', '丑时'],
      ['时辰边界·亥时(11)', '亥时'],
      ['闰年 2 月 29 日', '闰年 2 月 29 日'],
      ['年末跨年', '年末跨年'],
      ['数据集最早年边界(1950)', '数据集最早年边界'],
      ['性别·男', '男'],
      ['性别·女', '女'],
    ] as const;
    for (const [needle, label] of need) {
      assert.ok(
        all.some((c) => c.includes(needle)),
        `金标准用例没有覆盖「${label}」（找包含「${needle}」的用例）`,
      );
    }
    assert.ok(
      all.some((c) => c.includes('闰月生日')),
      '金标准用例没有覆盖闰月生日',
    );
  });

  for (const c of GOLDEN_CASES) {
    await t.test(`金标准快照一致 · ${c.id}`, () => {
      const actual = snapshotFor(c);
      const file = readGoldenFile(c.id);

      if (UPDATE) {
        // 新增用例时文件不存在是正常的 —— 刷新模式负责把它建出来
        writeGoldenFile(buildGoldenFile(c, actual));
        const reread = readGoldenFile(c.id);
        assert.ok(reread, `刷新后读不回快照文件：${c.id}`);
        assert.deepEqual(
          reread.snapshot,
          actual,
          `刷新后读回的快照与重算结果不一致：${c.id}`,
        );
        return;
      }

      assert.ok(
        file,
        `缺少金标准快照文件：tests/golden/${c.id}.json\n` +
          `  如果这是新增用例，先跑：ZIWEI_UPDATE_GOLDEN=1 npx tsx tests/golden.test.ts`,
      );

      // 生辰本身也要钉住 —— 快照文件和用例清单必须指向同一个生辰
      assert.deepEqual(
        file.birth,
        c.birth,
        `快照文件里的生辰与用例清单不一致：${c.id}`,
      );

      const diffs = diffSnapshot(file.snapshot, actual);
      if (diffs.length > 0) {
        assert.fail(
          `金标准盘被改动了：${c.id}（${c.label}）\n` +
            `  共 ${diffs.length} 处差异：\n${formatDiffs(diffs)}\n` +
            `  如果这次改动是**有意**的（引擎升级 / 口径修正），请人工确认后执行：\n` +
            `    ZIWEI_UPDATE_GOLDEN=1 npx tsx tests/golden.test.ts\n` +
            `  然后 review git diff 再提交。`,
        );
      }
    });
  }

  await t.test('快照文件写清了生成命令与引擎来源', () => {
    for (const c of GOLDEN_CASES) {
      const file = readGoldenFile(c.id);
      if (!file) {
        t.skip(`快照元信息检查 · ${c.id}`, '快照文件不存在（上面的用例已报缺失）');
        continue;
      }
      assert.equal(file.meta.schema, 'ziwei-golden-chart/v1', `${c.id}: meta.schema 不对`);
      assert.ok(
        file.meta.generatedBy.includes('ZIWEI_UPDATE_GOLDEN=1'),
        `${c.id}: meta 里没有写刷新命令`,
      );
      assert.ok(
        file.meta.howToRefresh.includes('ZIWEI_UPDATE_GOLDEN=1'),
        `${c.id}: meta.howToRefresh 里没有写刷新命令`,
      );
      assert.ok(
        file.meta.engine.includes('Renhuai123/ziwei-doushu'),
        `${c.id}: meta.engine 里没有写引擎来源`,
      );
      assert.ok(
        file.meta.dataset.includes('Renhuai123/ziwei-doushu'),
        `${c.id}: meta.dataset 里没有写数据集来源`,
      );
      assert.ok(
        file.meta.excludedTimeVaryingFields.includes('currentAge'),
        `${c.id}: meta 没写清楚排除了 currentAge`,
      );
    }
  });

  await t.test('快照不含随时间变化的字段', () => {
    for (const c of GOLDEN_CASES) {
      const file = readGoldenFile(c.id);
      if (!file) {
        t.skip(`快照时间字段检查 · ${c.id}`, '快照文件不存在（上面的用例已报缺失）');
        continue;
      }
      const text = JSON.stringify(file.snapshot);
      assert.ok(!text.includes('currentAge'), `${c.id}: 快照里出现了 currentAge`);
      assert.ok(
        !text.includes('isCurrentDaXian'),
        `${c.id}: 快照里出现了 isCurrentDaXian（随「今天」变化）`,
      );
    }
  });

  await t.test('闰月用例确实是农历闰月（用引擎农历换算反查）', () => {
    const leapCases = GOLDEN_CASES.filter((c) => c.lunarRef);
    assert.ok(leapCases.length >= 1, '没有任何闰月用例');
    for (const c of leapCases) {
      const ref = c.lunarRef!;
      const solar = lunarToSolar(ref.year, ref.month, ref.day, ref.isLeapMonth);
      assert.ok(
        solar,
        `引擎换算不出农历 ${ref.year} 年${ref.isLeapMonth ? '闰' : ''}${ref.month} 月 ${ref.day} 日`,
      );
      assert.deepEqual(
        { year: solar.year, month: solar.month, day: solar.day },
        { year: c.birth.year, month: c.birth.month, day: c.birth.day },
        `用例 ${c.id} 的农历标注与公历生辰对不上`,
      );
    }
  });

  await t.test('闰年 2 月 29 日用例确实落在闰年', () => {
    const feb29 = GOLDEN_CASES.find((c) => c.birth.month === 2 && c.birth.day === 29);
    assert.ok(feb29, '没有 2 月 29 日的用例');
    const probe = new Date(Date.UTC(feb29.birth.year, 1, 29));
    assert.equal(
      probe.getUTCDate(),
      29,
      `${feb29.id}：${feb29.birth.year} 年不是闰年，2 月 29 日不存在`,
    );
  });

  await t.test('金标准快照与 chart() 原始输出同步（同一用例两次调用结果一致）', () => {
    for (const c of GOLDEN_CASES) {
      const a = chart(c.birth);
      const b = chart(c.birth);
      assert.deepEqual(
        a.palaces.map((p) => p.name),
        b.palaces.map((p) => p.name),
        `${c.id}: 两次排盘的十二宫不一致`,
      );
    }
  });
};

export default suite;

/**
 * 独立运行（刷新金标准快照）：
 *
 *   ZIWEI_UPDATE_GOLDEN=1 npx tsx tests/golden.test.ts
 */
if (isMainModule(import.meta.url)) {
  await runStandalone(suite, '金标准盘快照');
}
