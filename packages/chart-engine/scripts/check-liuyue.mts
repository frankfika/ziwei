/**
 * 流月运限层自检 —— npx tsx packages/chart-engine/scripts/check-liuyue.mts
 *
 * 覆盖：
 *   - 流月命宫 = 流月月支所在本命宫（正月寅、二月卯…十二月丑顺推）
 *   - 流月十二宫名是标准 12 宫名的排列，方向与流年一致（逐宫地支 -1）
 *   - 流月四化与 SI_HUA_TABLE[月干] 一致
 *   - siHuaPalaces 每颗星确实落在对应宫的 stars 里
 *   - 同一年不同流月的命宫地支互不相同（按月序顺推）
 *   - 闰月传入 isLeapMonth 不崩
 */

import { chart, liuYueLayer, type ChartJSON } from '../src/index.js';
import { SI_HUA_TABLE, STEMS } from '../src/engine/constants.js';
import { buildLiuYuePillar } from '../src/engine/liuyue.js';

let pass = 0;
let fail = 0;

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

function section(title: string): void {
  console.log(`\n▶ ${title}`);
}

const PALACE_NAMES = [
  '命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫',
  '迁移宫', '交友宫', '官禄宫', '田宅宫', '福德宫', '父母宫',
];

const BIRTHS: Array<{ label: string; birth: Parameters<typeof chart>[0] }> = [
  { label: '男 1990-01-01 子时', birth: { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' } },
  { label: '女 1985-06-15 午时', birth: { year: 1985, month: 6, day: 15, hour: 6, gender: 'female' } },
];

const YEAR = 2026; // 丙午年
const MONTHS = [1, 2, 5, 12];

for (const { label, birth } of BIRTHS) {
  section(`${label} · ${YEAR} 年流月`);
  const c: ChartJSON = chart(birth);
  const mingByMonth: number[] = [];

  for (const m of MONTHS) {
    const ln = liuYueLayer(c, YEAR, m);
    const pillar = buildLiuYuePillar(YEAR, m);

    // 月支顺推：正月=寅(2)、二月=卯(3)、五月=午(6)、十二月=丑(1)
    ok(
      `${m} 月：流月月支 = (月序-1+2)%12`,
      pillar.branch === (((m - 1 + 2) % 12) + 12) % 12,
      `got ${pillar.branch}`,
    );

    // 流月命宫 = 月支
    ok(`${m} 月：流月命宫地支 = 月支`, ln.mingBranch === pillar.branch);
    mingByMonth.push(ln.mingBranch);

    // 十二宫名是标准排列
    const names = ln.palaces.map((p) => p.name).sort();
    ok(
      `${m} 月：流月十二宫名是标准 12 宫排列`,
      names.length === 12 && PALACE_NAMES.every((n) => names.includes(n)),
    );

    // 方向：流年兄弟宫在命宫地支 -1
    const mingPal = ln.palaces.find((p) => p.name === '命宫');
    const broPal = ln.palaces.find((p) => p.name === '兄弟宫');
    ok(
      `${m} 月：兄弟宫在命宫下一宫（地支 -1）`,
      !!mingPal && !!broPal && broPal.branch === (((mingPal.branch - 1) % 12) + 12) % 12,
    );

    // 四化与 SI_HUA_TABLE[月干] 一致
    const stemIdx = STEMS.indexOf(pillar.ganzhi[0] as string);
    const expect = SI_HUA_TABLE[stemIdx];
    ok(
      `${m} 月：流月四化 = ${pillar.ganzhi} 干四化`,
      ln.siHua.lu === expect[0] && ln.siHua.quan === expect[1]
        && ln.siHua.ke === expect[2] && ln.siHua.ji === expect[3],
      `got ${JSON.stringify(ln.siHua)} expect ${JSON.stringify(expect)}`,
    );

    // 四化星落宫：每颗星确实在对应宫的 stars 里
    for (const [key, starName] of [['禄', ln.siHua.lu], ['权', ln.siHua.quan], ['科', ln.siHua.ke], ['忌', ln.siHua.ji]] as const) {
      const branch = (ln.siHuaPalaces as Record<string, number | undefined>)[key];
      if (branch === undefined) continue; // 星不在任何宫，允许省略
      const palace = c.palaces.find((p) => p.branch === branch);
      ok(
        `${m} 月：化${key}（${starName}）落宫正确`,
        !!palace && palace.stars.some((s) => s.name === starName),
      );
    }

    // 闰月不崩
    const leap = liuYueLayer(c, YEAR, 6, { isLeapMonth: true, liuriDay: 20 });
    ok(`${m} 月旁支：闰月口径不崩（返回 month 合理）`, leap.month >= 1 && leap.month <= 12);
  }

  // 同一年不同流月命宫互不相同（月支互不相同 → 命宫互不相同）
  ok(
    '各流月命宫地支互不相同',
    new Set(mingByMonth).size === mingByMonth.length,
    JSON.stringify(mingByMonth),
  );
}

console.log(`\n────────────────────────────────────────────────`);
console.log(`${fail === 0 ? '✅' : '❌'} check-liuyue：${pass} 项断言，${fail} 失败`);
if (fail > 0) process.exit(1);
