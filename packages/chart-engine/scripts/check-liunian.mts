/**
 * 流年/大限四化运限层自检。
 *
 * 覆盖：
 *   1) 3 个固定生辰（男/女、不同命宫位置）× 3 个流年（2024 甲辰 / 2025 乙巳 / 2026 丙午）
 *      - 流年命宫宫名必为「命宫」
 *      - 12 个流年宫名是 PALACE_NAMES_ORDER 的一个排列
 *      - 四化四星互不相同，且与 SI_HUA_TABLE[yearStem] 一致
 *      - siHuaPalaces 中每颗星确实落在对应宫的 stars 里
 *   2) 大限四化回填：每个大限项 stemIndex/stemName/siHua 与其大限宫宫干查表一致
 *   3) 与 iztro 交叉验证：
 *      - 流年命宫地支：本引擎 mingBranch vs (yearly.index + 2) % 12
 *      - 流年四化：本引擎 siHua vs yearly.mutagen（顺序 [禄,权,科,忌]）
 *
 * 年柱口径说明：本引擎按公历年份年柱口径（(year - 4) % N，正月初一/公历换年）；
 * iztro horoscope(date) 按节气立春换年，立春–春节间可能与公历口径差一年。
 * 因此交叉验证统一传年中日期（YYYY-06-01），两口径此时必然一致；若仍不一致即报错。
 *
 * 运行：npx tsx packages/chart-engine/scripts/check-liunian.mts
 * 退出码 0 = 全部通过；任一断言失败抛出并非 0 退出。
 */

import assert from 'node:assert/strict';

import { astro } from 'iztro';

import { chart, liuNianLayer, type Birth } from '../src/index';
import { PALACE_NAMES_ORDER, SI_HUA_TABLE, STEMS } from '../src/engine/constants';
import { getYearStemIndex } from '../src/engine/sihua';

const BIRTHS: Array<{ label: string; birth: Birth }> = [
  { label: '男命 1990-01-01 子时', birth: { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' } },
  { label: '女命 1985-06-15 午时', birth: { year: 1985, month: 6, day: 15, hour: 6, gender: 'female' } },
  { label: '男命 2000-11-30 卯时', birth: { year: 2000, month: 11, day: 30, hour: 3, gender: 'male' } },
];

const YEARS = [2024, 2025, 2026]; // 甲辰 / 乙巳 / 丙午

let checks = 0;

for (const { label, birth } of BIRTHS) {
  const c = chart(birth);

  // ── 大限四化回填 ──
  assert.equal(c.daXians.length, 12, `${label}：daXians.length !== 12`);
  for (const dx of c.daXians) {
    const palace = c.palaces.find((p) => p.branch === dx.palaceBranch);
    assert.ok(palace, `${label}：大限宫支 ${dx.palaceBranch} 在本命盘中不存在`);
    assert.equal(dx.stemIndex, palace!.stem, `${label}：大限 stemIndex 与宫干不符`);
    assert.equal(dx.stemName, STEMS[palace!.stem], `${label}：大限 stemName 与宫干不符`);
    const expect = SI_HUA_TABLE[palace!.stem]!;
    assert.deepEqual(
      [dx.siHua!.lu, dx.siHua!.quan, dx.siHua!.ke, dx.siHua!.ji],
      [...expect],
      `${label}：大限四化与 SI_HUA_TABLE[${palace!.stem}] 不符`,
    );
    checks++;
  }

  // ── 流年层 ──
  const genderCn = birth.gender === 'male' ? '男' : '女';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const astrolabe: any = astro.bySolar(
    `${birth.year}-${String(birth.month).padStart(2, '0')}-${String(birth.day).padStart(2, '0')}`,
    birth.hour,
    genderCn,
  );

  for (const year of YEARS) {
    const layer = liuNianLayer(c, year);

    // 1) 流年命宫宫名
    const ming = layer.palaces.find((p) => p.branch === layer.mingBranch);
    assert.equal(ming?.name, '命宫', `${label} ${year}：流年命宫宫名不是「命宫」`);

    // 2) 十二宫名是 PALACE_NAMES_ORDER 的排列
    assert.equal(layer.palaces.length, 12, `${label} ${year}：流年宫数量不是 12`);
    assert.deepEqual(
      [...layer.palaces.map((p) => p.name)].sort(),
      [...PALACE_NAMES_ORDER].sort(),
      `${label} ${year}：流年宫名不是 PALACE_NAMES_ORDER 的排列`,
    );
    // 方向校验：自命宫起逐宫地支减 1
    layer.palaces.forEach((p, i) => {
      assert.equal(
        p.branch,
        (((layer.mingBranch - i) % 12) + 12) % 12,
        `${label} ${year}：第 ${i} 宫（${p.name}）地支方向错误`,
      );
    });

    // 3) 四化四星互不相同，且与 SI_HUA_TABLE[yearStem] 一致
    const stars = [layer.siHua.lu, layer.siHua.quan, layer.siHua.ke, layer.siHua.ji];
    assert.equal(new Set(stars).size, 4, `${label} ${year}：四化四星有重复：${stars}`);
    const yearStem = getYearStemIndex(year);
    assert.deepEqual(
      stars,
      [...SI_HUA_TABLE[yearStem]!],
      `${label} ${year}：流年四化与 SI_HUA_TABLE[${yearStem}]（${STEMS[yearStem]}）不符`,
    );

    // 4) siHuaPalaces 落宫校验
    const keys = ['禄', '权', '科', '忌'] as const;
    for (const k of keys) {
      const branch = layer.siHuaPalaces[k];
      assert.ok(branch !== undefined, `${label} ${year}：siHuaPalaces 缺 ${k} 的落宫`);
      const palace = c.palaces.find((p) => p.branch === branch);
      assert.ok(palace, `${label} ${year}：${k} 落宫支 ${branch} 不存在`);
      const keyMap = { 禄: 'lu', 权: 'quan', 科: 'ke', 忌: 'ji' } as const;
      const starName = layer.siHua[keyMap[k]];
      assert.ok(
        palace!.stars.some((s) => s.name === starName),
        `${label} ${year}：${k} 星「${starName}」不在地支 ${branch} 宫的 stars 里`,
      );
    }
    checks += 4;

    // 5) 与 iztro 交叉验证（年中日期避开立春换年差异）
    const horo = astrolabe.horoscope(`${year}-06-01`);
    const iztroBranch = (horo.yearly.index + 2) % 12;
    assert.equal(
      layer.mingBranch,
      iztroBranch,
      `${label} ${year}：流年命宫地支不符（本引擎 ${layer.mingBranch} vs iztro ${iztroBranch}）`,
    );
    assert.deepEqual(
      stars,
      horo.yearly.mutagen,
      `${label} ${year}：流年四化不符（本引擎 [${stars}] vs iztro [${horo.yearly.mutagen}]）`,
    );
    checks += 2;
  }
}

console.log(`✓ check-liunian 全部通过（${BIRTHS.length} 生辰 × ${YEARS.length} 流年 + 大限回填，共 ${checks} 项断言）`);
