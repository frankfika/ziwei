/**
 * 流月运限层。
 *
 * 口径（紫微斗数通行口径）：
 *   年干 = getYearStemIndex(year)（(year - 4) % 10，公历年份/正月初一换年）
 *   实际月序 = getEffectiveLiuYueMonth(month, options)
 *     （闰月后半月归下月；闰十二月后半月归正月）
 *   月干 = 五虎遁（getLiuYueSiHua 内部按实际月序计算）
 *   月支 = ((实际月序 - 1 + 2) % 12 + 12) % 12（正月=寅=2 …… 十二月=丑=1）
 *   流月命宫 = 流月月支所在宫；流月十二宫自命宫起按 PALACE_NAMES_ORDER
 *   逐宫地支索引减 1（模 12），与流年层完全同构。
 */

import type { LiuYueLayer, SiHua, ZiweiChart } from './types';
import { BRANCHES, PALACE_NAMES_ORDER, STEMS } from './constants';
import { getLiuYueSiHua, getYearStemIndex } from './sihua';

export interface LiuYueOptions {
  /** 闰月流月按实际农历日的前后半月取本月/下月口径。 */
  isLeapMonth?: boolean;
  /** 闰月当天的农历日（前后半月切分用）。 */
  liuriDay?: number;
}

export interface LiuYuePillar {
  /** 实际采用的农历月序 1–12 */
  month: number;
  /** 流月干支名，如「丙寅月」 */
  ganzhi: string;
  /** 流月月柱地支索引（正月=寅=2 …… 十二月=丑=1） */
  branch: number;
  /** 流月四化（流月月干查表） */
  siHua: { lu: string; quan: string; ke: string; ji: string };
}

/** 纯计算：流月月柱 + 四化（不依赖盘面） */
export function buildLiuYuePillar(
  year: number,
  month: number,
  options: LiuYueOptions = {},
): LiuYuePillar {
  const y = Math.trunc(year);
  const yearStem = getYearStemIndex(y);

  // 实际月序 + 月干（五虎遁，内部已按 effectiveMonth 计算）
  const r = getLiuYueSiHua(yearStem, month, options);
  const effectiveMonth = r.month;

  // 月支：正月=寅=2、二月=卯=3 …… 十二月=丑=1
  const branch = (((effectiveMonth - 1 + 2) % 12) + 12) % 12;

  const ganzhi = `${STEMS[r.stemIndex] ?? ''}${BRANCHES[branch] ?? ''}月`;
  const siHua = {
    lu: r.transforms.禄,
    quan: r.transforms.权,
    ke: r.transforms.科,
    ji: r.transforms.忌,
  };

  return { month: effectiveMonth, ganzhi, branch, siHua };
}

/** 星不存在于任何宫时省略该键，故以 Partial 构建后收窄返回 */
type SiHuaPalaces = LiuYueLayer['siHuaPalaces'];

/** 流月运限层（引擎层，结构对齐 buildLiuNianLayer） */
export function buildLiuYueLayer(
  chart: ZiweiChart,
  year: number,
  month: number,
  options: LiuYueOptions = {},
): LiuYueLayer {
  const y = Math.trunc(year);
  const pillar = buildLiuYuePillar(y, month, options);

  // 流月命宫 = 流月月支
  const mingBranch = pillar.branch;

  // 流月十二宫：自命宫起每下一宫地支索引减 1（模 12）
  const palaces = PALACE_NAMES_ORDER.map((name, i) => ({
    branch: (((mingBranch - i) % 12) + 12) % 12,
    name,
  }));

  const siHua = pillar.siHua;

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
    month: pillar.month,
    ganzhi: pillar.ganzhi,
    mingBranch,
    palaces,
    siHua,
    siHuaPalaces: siHuaPalaces as SiHuaPalaces,
  };
}
