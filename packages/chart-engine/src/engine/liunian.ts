/**
 * 流年运限层。
 *
 * 年柱口径与 sihua.ts 一致：(year - 4) % N（公历年份/正月初一换年）。
 * 流年命宫 = 流年地支所在宫；流年十二宫自命宫起按 PALACE_NAMES_ORDER
 * 逐宫地支索引减 1（模 12），与本命盘宫名排布方向一致。
 */

import type { LiuNianLayer, SiHua, ZiweiChart } from './types';
import { BRANCHES, PALACE_NAMES_ORDER, STEMS } from './constants';
import { getLiuNianSiHua, getYearBranchIndex, getYearStemIndex } from './sihua';

/** 星不存在于任何宫时省略该键，故以 Partial 构建后收窄返回 */
type SiHuaPalaces = LiuNianLayer['siHuaPalaces'];

export function buildLiuNianLayer(chart: ZiweiChart, year: number): LiuNianLayer {
  const y = Math.trunc(year);
  const yearStem = getYearStemIndex(y);
  const yearBranch = getYearBranchIndex(y);
  const ganzhi = `${STEMS[yearStem] ?? ''}${BRANCHES[yearBranch] ?? ''}`;

  // 流年命宫 = 流年地支
  const mingBranch = yearBranch;

  // 流年十二宫：自命宫起每下一宫地支索引减 1（模 12）
  const palaces = PALACE_NAMES_ORDER.map((name, i) => ({
    branch: (((mingBranch - i) % 12) + 12) % 12,
    name,
  }));

  // 流年四化（流年天干查四化表）
  const t = getLiuNianSiHua(y).transforms;
  const siHua = { lu: t.禄, quan: t.权, ke: t.科, ji: t.忌 };

  // 四化星在本命盘中的落宫地支；星不在任何宫则省略该键
  const siHuaPalaces: Partial<SiHuaPalaces> = {};
  const starOf: Array<[SiHua, string]> = [
    ['禄', siHua.lu],
    ['权', siHua.quan],
    ['科', siHua.ke],
    ['忌', siHua.ji],
  ];
  for (const [key, starName] of starOf) {
    if (!starName) continue;
    const palace = chart.palaces.find(p => p.stars.some(s => s.name === starName));
    if (palace) siHuaPalaces[key] = palace.branch;
  }

  return {
    year: y,
    ganzhi,
    mingBranch,
    palaces,
    siHua,
    siHuaPalaces: siHuaPalaces as SiHuaPalaces,
  };
}
