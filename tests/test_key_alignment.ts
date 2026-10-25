/**
 * 键口径实证校验（核心验收测试）。
 *
 * 目的：证明「数据集 key 的 y/m/d/h 就是引擎 generateChart 的输入」，
 *      而不是照抄文档假设。
 *
 * 方法：用数据集自带的 `ms`（命宫第一颗主星）当指纹。
 *      对样本 key 跑引擎，取命宫第一主星，与数据集 ms 比对。
 *
 * 关键分支：若直接 (y,m,d,h) 不匹配、而 (y,m,d+1,h=0) 匹配，
 *          说明数据集把晚子时也折进了排盘日 —— 那口径就完全不同。
 *
 * 运行: npx tsx tests/test_key_alignment.ts
 */

import { chart } from '@ziwei/chart-engine';
import { ReadingIndex, parseKey } from '@ziwei/reading-index';

const index = new ReadingIndex();

/** 引擎算出的「命宫第一主星」 */
function engineMingStar(c: ReturnType<typeof chart>): string | null {
  const ming = c.palaces.find((p) => p.isMingGong);
  if (!ming) return null;
  return ming.majorStars[0] ?? null;
}

interface Sample {
  key: string;
  year: number; month: number; day: number; hour: number; gender: 'male' | 'female';
  ms: string | null;
}

function sampleKeys(year: number, n: number): Sample[] {
  const idx = index.getYearIndex(year);
  if (!idx) return [];
  const keys = Object.keys(idx.records);
  // 均匀取样，覆盖月初/月末/闰日附近
  const step = Math.max(1, Math.floor(keys.length / n));
  const out: Sample[] = [];
  for (let i = 0; i < keys.length && out.length < n; i += step) {
    const parsed = parseKey(keys[i]);
    if (!parsed) continue;
    const rec = index.getByKey(keys[i]);
    if (!rec.found) continue;
    out.push({
      key: keys[i],
      ...parsed,
      ms: rec.record.ms,
    });
  }
  return out;
}

function run() {
  const years = index.indexedYears();
  if (!years.length) {
    console.error('❌ 没有已建索引的年份。先跑 npm run index:build');
    process.exit(1);
  }

  let total = 0;
  let directHit = 0;
  let shiftedHit = 0;
  const mismatches: string[] = [];

  for (const year of years) {
    const samples = sampleKeys(year, 120);
    for (const s of samples) {
      total += 1;

      // 口径 A：直接用 key 的 y/m/d/h
      const direct = chart({
        year: s.year, month: s.month, day: s.day, hour: s.hour, gender: s.gender,
      });
      const directStar = engineMingStar(direct);

      if (directStar === s.ms) {
        directHit += 1;
        continue;
      }

      // 口径 B：日期 +1、时辰归子时（0）—— 晚子时折进排盘日的假设
      if (s.hour === 0) {
        const next = new Date(Date.UTC(s.year, s.month - 1, s.day + 1));
        const shifted = chart({
          year: next.getUTCFullYear(),
          month: next.getUTCMonth() + 1,
          day: next.getUTCDate(),
          hour: 0,
          gender: s.gender,
        });
        if (engineMingStar(shifted) === s.ms) {
          shiftedHit += 1;
          continue;
        }
      }

      if (mismatches.length < 12) {
        mismatches.push(
          `  key=${s.key} 数据集ms=${s.ms ?? 'null'} 引擎直排=${directStar ?? 'null'}`,
        );
      }
    }
    console.log(`  ${year}: 采样 ${samples.length} 条完成`);
  }

  console.log('');
  console.log(`样本总数        : ${total}`);
  console.log(`口径A 直排匹配  : ${directHit}  (${((directHit / total) * 100).toFixed(2)}%)`);
  console.log(`口径B 次日匹配  : ${shiftedHit}  (${((shiftedHit / total) * 100).toFixed(2)}%)`);
  console.log(`不匹配          : ${total - directHit - shiftedHit}`);
  if (mismatches.length) {
    console.log('\n不匹配样例:');
    mismatches.forEach((m) => console.log(m));
  }

  const pass = directHit / total >= 0.99;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — 键口径判定: ${
    pass ? '直排口径（key 的 y/m/d/h 即引擎输入）' : '需人工复核'
  }`);
  process.exit(pass ? 0 : 1);
}

run();
