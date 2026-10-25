/**
 * 键口径实证校验 —— **最关键的一条测试，不许削弱**。
 *
 * 目的：证明「数据集 key 的 y/m/d/h 就是排盘引擎 chart() 的输入」，
 *      而不是照抄文档假设。
 *
 * 方法：用数据集自带的 `ms`（命宫第一主星）当指纹。
 *      对样本 key 跑引擎，取命宫第一主星，与数据集 ms 比对。
 *
 * 两个口径：
 *   A 直排    —— chart({year:y, month:m, day:d, hour:h, gender:g})  ← 期望 100% 命中
 *   B 次日折算 —— chart({year:y, month:m, day:d+1, hour:0, ...})     ← 期望 0% 命中
 *   （口径 B 假设数据集把晚子时折进了排盘日。若 B 也命中，说明口径理解错了。）
 *
 * 样本量：每个已建索引年份 200 条 → 3 年共 600 条。
 *
 * 运行：npx tsx tests/test_key_alignment.ts（独立报告）或 npm test（整套）
 */

import assert from 'node:assert/strict';

import { chart } from '@ziwei/chart-engine';
import { ReadingIndex, parseKey } from '@ziwei/reading-index';

import type { Tester } from './harness';
import { probeData } from './fixtures/data';

/**
 * 每个年份取多少条样本。
 *
 * 自适应：**总样本量守恒在 ~600–1000 条**，按已建索引的年份数摊分。
 *
 * 为什么不是固定 200/年：
 *  · 3 个年份时 → 200/年 = 600 条（扎堆 3 年，测得深）
 *  · 77 个年份时 → 8/年 = 616 条（铺开 77 年，测得广）
 *
 * 键口径要回答的问题是「**整个数据集**的 key 约定是否一致」，
 * 所以**年份覆盖度比单年深度更重要** —— 77 年各 8 条的证据力
 * 远强于 3 年各 200 条。而固定 200/年还会让 77 年场景跑到 15,400 次排盘
 * （约 7 分钟），日常回归跑不动。
 */
const MIN_TOTAL_SAMPLES = 600;
const MAX_PER_YEAR = 200;

function perYearFor(yearCount: number): number {
  if (yearCount <= 0) return 0;
  return Math.min(MAX_PER_YEAR, Math.max(8, Math.ceil(MIN_TOTAL_SAMPLES / yearCount)));
}

/** 样本 */
interface Sample {
  key: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: 'male' | 'female';
  ms: string | null;
}

/**
 * 键口径统计（供独立运行入口打印报告用）。
 *
 * 独立入口 tests/test_key_alignment.ts 与 scripts/acceptance.sh 约定读这几个字段，
 * 所以保持字段名与输出格式稳定。
 */
export interface KeyAlignmentStats {
  /** 样本总数 */
  total: number;
  /** 口径 A（直排）命中数 */
  directHit: number;
  /** 口径 B（次日折算）独有命中数 —— 直排没中、折算中了；必须为 0 */
  shiftedOnlyHit: number;
  /** 次日折算的盘恰好与数据集同主星的次数（直排已命中时也统计），仅作参考 */
  shiftedCoincidence: number;
  /** 参与统计的年份 */
  years: number[];
  /** 每个年份取多少条 */
  perYear: number;
  /** 不匹配样例 */
  mismatches: string[];
  /** 是否因为没有数据集而跳过 */
  skipped: boolean;
}

/** 本次运行的统计（跑完 suite 后可读） */
export const keyAlignmentStats: KeyAlignmentStats = {
  total: 0,
  directHit: 0,
  shiftedOnlyHit: 0,
  shiftedCoincidence: 0,
  years: [],
  perYear: 0,
  mismatches: [],
  skipped: false,
};

/** 引擎算出的「命宫第一主星」 */
function engineMingStar(c: ReturnType<typeof chart>): string | null {
  const ming = c.palaces.find((p) => p.isMingGong);
  if (!ming) return null;
  return ming.majorStars[0] ?? null;
}

/**
 * 均匀取样。
 *
 * 排序保证确定性（不依赖 JSON 对象键的插入顺序）；
 * 步长保证覆盖全年（月初/月末/闰日附近）。
 *
 * 取样要 seek 进 700MB 的源文件读整条记录（13 维解读全文），
 * 所以按年份**缓存**起来，多个用例共用同一批样本 —— 否则会白读三遍。
 */
const sampleCache = new Map<number, Sample[]>();

function sampleKeys(index: ReadingIndex, year: number, n: number): Sample[] {
  const cached = sampleCache.get(year);
  if (cached) return cached;

  const idx = index.getYearIndex(year);
  if (!idx) {
    sampleCache.set(year, []);
    return [];
  }

  const keys = Object.keys(idx.records).sort();
  const step = Math.max(1, Math.floor(keys.length / n));
  const out: Sample[] = [];

  for (let i = 0; i < keys.length && out.length < n; i += step) {
    const key = keys[i];
    const parsed = parseKey(key);
    if (!parsed) continue;
    const rec = index.getByKey(key);
    if (!rec.found) continue;
    out.push({ key, ...parsed, ms: rec.record.ms });
  }

  // 口径 B 只能对 hour=0 的样本检验；确保每年至少采到一条子时，
  // 否则「口径 B 0%」就是空断言。
  if (!out.some((s) => s.hour === 0)) {
    const hour0 = keys.find((k) => parseKey(k)?.hour === 0);
    if (hour0) {
      const parsed = parseKey(hour0);
      const rec = index.getByKey(hour0);
      if (parsed && rec.found) {
        out[out.length - 1] = { key: hour0, ...parsed, ms: rec.record.ms };
      }
    }
  }

  sampleCache.set(year, out);
  return out;
}

export const suite = async (t: Tester): Promise<void> => {
  const index = new ReadingIndex();
  const data = probeData(index);

  if (!data.available) {
    keyAlignmentStats.skipped = true;
    t.skip('键口径校验（直排 100% / 次日折算 0%）', `${data.reason}`);
    t.skip('键口径样本量 ≥ 600', `${data.reason}`);
    return;
  }

  keyAlignmentStats.years = [...data.indexedYears];

  const PER_YEAR = perYearFor(data.indexedYears.length);
  keyAlignmentStats.perYear = PER_YEAR;

  await t.test('键口径样本量 ≥ 600', () => {
    const total = data.indexedYears.length * PER_YEAR;
    assert.ok(
      total >= MIN_TOTAL_SAMPLES,
      `样本量只有 ${total} 条（${data.indexedYears.length} 个年份 × ${PER_YEAR}），要求 ≥ ${MIN_TOTAL_SAMPLES}`,
    );
  });

  await t.test('键口径校验（直排 100% / 次日折算 0%）', () => {
    let total = 0;
    let directHit = 0;
    /** 直排未命中、但次日折算命中 —— 口径 B 才是真相的样本数，必须为 0 */
    let shiftedOnlyHit = 0;
    /** 次日折算的盘恰好与数据集同主星（直排已命中时也统计），仅作参考 */
    let shiftedCoincidence = 0;
    const mismatches: string[] = [];
    const shiftedSamples: string[] = [];

    for (const year of data.indexedYears) {
      const samples = sampleKeys(index, year, PER_YEAR);
      assert.ok(
        samples.length > 0,
        `${year} 年没取到样本（索引分片异常？）`,
      );

      for (const s of samples) {
        total += 1;

        // 口径 A：直接用 key 的 y/m/d/h
        const directStar = engineMingStar(
          chart({ year: s.year, month: s.month, day: s.day, hour: s.hour, gender: s.gender }),
        );
        if (directStar === s.ms) {
          directHit += 1;
        } else if (mismatches.length < 12) {
          mismatches.push(
            `  key=${s.key} 数据集ms=${s.ms ?? 'null'} 引擎直排=${directStar ?? 'null'}`,
          );
        }

        // 口径 B：日期 +1、时辰归子时（0）—— 晚子时折进排盘日的假设
        if (s.hour === 0) {
          const next = new Date(Date.UTC(s.year, s.month - 1, s.day + 1));
          const shiftedStar = engineMingStar(
            chart({
              year: next.getUTCFullYear(),
              month: next.getUTCMonth() + 1,
              day: next.getUTCDate(),
              hour: 0,
              gender: s.gender,
            }),
          );
          if (shiftedStar === s.ms) {
            shiftedCoincidence += 1;
            if (directStar !== s.ms) {
              shiftedOnlyHit += 1;
              if (shiftedSamples.length < 12) {
                shiftedSamples.push(
                  `  key=${s.key} 数据集ms=${s.ms ?? 'null'} 引擎次日=${shiftedStar ?? 'null'}`,
                );
              }
            }
          }
        }
      }
    }

    const directRate = (directHit / total) * 100;
    const shiftedOnlyRate = (shiftedOnlyHit / total) * 100;

    keyAlignmentStats.total = total;
    keyAlignmentStats.directHit = directHit;
    keyAlignmentStats.shiftedOnlyHit = shiftedOnlyHit;
    keyAlignmentStats.shiftedCoincidence = shiftedCoincidence;
    keyAlignmentStats.mismatches = [...mismatches];

    console.log(
      `    键口径样本 ${total} 条（${data.indexedYears.join('/')} 各 ${PER_YEAR} 条）：` +
        `直排 ${directHit}/${total}（${directRate.toFixed(2)}%）· ` +
        `次日折算独有命中 ${shiftedOnlyHit}（${shiftedOnlyRate.toFixed(2)}%）· ` +
        `次日折算巧合同星 ${shiftedCoincidence}（仅参考，不构成口径证据）`,
    );

    assert.equal(
      directHit,
      total,
      `直排口径没有 100% 命中（${directHit}/${total}）。不匹配样例：\n` +
        (mismatches.length ? mismatches.join('\n') : '（无）'),
    );

    assert.equal(
      shiftedOnlyHit,
      0,
      `口径 B（次日折算）命中了 ${shiftedOnlyHit} 条，说明数据集确实折算过排盘日。样例：\n` +
        (shiftedSamples.length ? shiftedSamples.join('\n') : '（无）'),
    );
  });

  await t.test('抽样确实覆盖多个时辰（不能只抽子时）', () => {
    const hours = new Set<number>();
    for (const year of data.indexedYears) {
      for (const s of sampleKeys(index, year, PER_YEAR)) hours.add(s.hour);
    }
    assert.ok(hours.size >= 6, `样本只覆盖了 ${hours.size} 个时辰，覆盖面太窄`);
  });

  await t.test('抽样确实覆盖男女两性', () => {
    const genders = new Set<string>();
    for (const year of data.indexedYears) {
      for (const s of sampleKeys(index, year, PER_YEAR)) genders.add(s.gender);
    }
    assert.ok(genders.has('male') && genders.has('female'), '样本没有同时覆盖男女');
  });
};

export default suite;
