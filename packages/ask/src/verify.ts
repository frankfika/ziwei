/**
 * 防编造机械自检 —— verifyAnswer。
 *
 * **不是让模型自查**，而是对回答文本做字符串级比对：
 *   ① 星名：把回答里出现的星名（参照系 = 标准紫微星名全集）抽出来，
 *      对照 `chart.palaces[].stars[].name` 全集；不在盘里的 → suspectStars
 *   ② 宫名：抽出回答里的宫位写法，对照十二宫名单；不在名单里的 → suspectPalaces
 *   ③ 落宫：抽出「X 在/坐/守/入 Y宫」这类**明确落宫断言**，
 *      与盘面实际落宫比对；对不上 → suspectPlacements
 *
 * 目的：给 UI 一句「以下内容不在你的盘面中，请谨慎参考」。
 *
 * ⚠️ 关于「盘里没有的星」—— 一条重要的基座事实：
 *   本排盘引擎**每张盘都摆齐全部 70 个星**（实测数千张盘，星的并集恒为 70，
 *   变的只是落宫）。所以 ① 能抓到的，只有「引擎不摆的标准紫微星名」
 *   （天恩、天医、福生、将星、天罗…）。若模型编造的是「贪狼」这种
 *   14 主星之一，它**确实在你盘里**（只是宫位可能不对）→ 由 ③ 兜住。
 *   详见文件末尾的风险说明。
 */

import type { ChartJSON } from '@ziwei/core';
import type { PromptDimension } from './prompt';
import {
  ALL_PLACE_NAMES_FOR_DETECT,
  AMBIGUOUS_STAR_NAMES,
  NON_PALACE_TERMS,
  PALACE_NAMES,
  REFERENCE_STAR_NAMES,
  STAR_CONTEXT_MARKERS,
  canonicalPalaceName,
} from './vocabulary';

export interface VerifyAnswerInput {
  /** 这张盘（盘面事实来源） */
  chart: ChartJSON;
  /** 本次注入的解读原文（用于区分「原文举例」与「模型凭空补充」） */
  dimensions?: PromptDimension[];
}

export interface VerifyAnswerResult {
  /** 无任何硬性疑似项时为 true */
  ok: boolean;
  /** 盘面中不存在的星曜名（确定） */
  suspectStars: string[];
  /** 十二宫名单中不存在的宫位写法（确定） */
  suspectPalaces: string[];
  /** 落宫断言与盘面不符的条目，形如「太阳→夫妻宫」 */
  suspectPlacements: string[];
  /** 歧义词（既是星名又是常用中文词）且未带星曜语境标记 —— 软提示，不计入 ok */
  ambiguousStars: string[];
  /** suspectStars / ambiguousStars 中「出现在本次注入原文里」的子集 */
  sourceBackedStars: string[];
  /** 面向用户的中文提示 */
  warnings: string[];
}

/** 收集一张盘里出现过的全部星名。 */
export function chartStarNames(chart: ChartJSON): Set<string> {
  const out = new Set<string>();
  for (const p of chart.palaces ?? []) {
    for (const s of p.stars ?? []) if (s?.name) out.add(s.name);
    for (const s of p.majorStars ?? []) out.add(s);
    for (const s of p.minorStars ?? []) out.add(s);
    for (const s of p.luckyStars ?? []) out.add(s);
    for (const s of p.shaStars ?? []) out.add(s);
    for (const s of p.borrowedStars ?? []) out.add(s);
  }
  return out;
}

/** 收集一张盘的十二宫标准名。 */
export function chartPalaceNames(chart: ChartJSON): Set<string> {
  const out = new Set<string>();
  for (const p of chart.palaces ?? []) {
    if (!p?.name) continue;
    out.add(canonicalPalaceName(p.name) ?? p.name);
  }
  return out;
}

/** 星名在回答里是否带「星曜语境」。 */
function hasStarContext(answer: string, star: string): boolean {
  for (const marker of STAR_CONTEXT_MARKERS) {
    let idx = answer.indexOf(star);
    while (idx !== -1) {
      const around = answer.slice(Math.max(0, idx - 4), idx + star.length + 4);
      if (around.includes(marker)) return true;
      idx = answer.indexOf(star, idx + star.length);
    }
  }
  return false;
}

/** 一个「X宫」候选：surface 是表层写法，stem 是「宫」字前的那部分。 */
interface PalaceCandidate {
  surface: string;
  stem: string;
}

/**
 * 找出回答里所有「X宫」形态的候选宫位写法。
 *
 * 注意：正则的贪婪匹配会把前面的字一起吞进来（「你的太阴宫」匹配成「的太阴宫」），
 * 所以这里对匹配结果**从右往左**逐长度试探，取第一个能归一成宫名或能认出是星名的词干。
 */
function palaceCandidates(answer: string): PalaceCandidate[] {
  const re = /[\u4e00-\u9fa5]{0,3}宫/g;
  const out: PalaceCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const body = m[0].slice(0, -1); // 「宫」字之前的部分
    if (!body) continue;
    for (let len = body.length; len >= 1; len--) {
      const stem = body.slice(body.length - len);
      const canonical =
        canonicalPalaceName(`${stem}宫`) ?? canonicalPalaceName(stem);
      if (canonical || REFERENCE_STAR_NAMES.includes(stem)) {
        out.push({ surface: `${stem}宫`, stem });
        break;
      }
    }
  }
  return out;
}

/**
 * 落宫断言检查。
 * 匹配「<星名>在/坐/守/入<宫名>宫」，核对盘面实际落宫。
 * 空宫借星也算数（borrowedStars）。
 */
function checkPlacements(
  answer: string,
  chart: ChartJSON,
): { suspect: string[]; checked: number } {
  const suspect: string[] = [];
  let checked = 0;

  // 星 → 实际所在宫（标准名）
  const located = new Map<string, Set<string>>();
  // 宫（标准名） → 借来的星
  const borrowed = new Map<string, Set<string>>();
  for (const p of chart.palaces ?? []) {
    const palace = canonicalPalaceName(p.name) ?? p.name;
    for (const s of p.stars ?? []) {
      if (!s?.name) continue;
      if (!located.has(s.name)) located.set(s.name, new Set());
      located.get(s.name)!.add(palace);
    }
    if (p.borrowedStars?.length) {
      if (!borrowed.has(palace)) borrowed.set(palace, new Set());
      for (const s of p.borrowedStars) borrowed.get(palace)!.add(s);
    }
  }

  const starAlt = REFERENCE_STAR_NAMES.map(escapeRe).join('|');
  const palaceAlt = ALL_PLACE_NAMES_FOR_DETECT.map(escapeRe).join('|');
  // 「X在Y宫」/「X坐Y宫」/「X守Y宫」/「X入Y宫」；宫名的「宫」字可省（「太阳在命宫」）
  const re = new RegExp(
    `(${starAlt})(?:在|坐|守|入)(${palaceAlt})宫?`,
    'g',
  );

  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const star = m[1];
    const palace = canonicalPalaceName(m[2]) ?? m[2];
    checked += 1;
    const actual = located.get(star);
    if (!actual) continue; // 这颗星根本不在盘里 —— 归 suspectStars 管
    if (actual.has(palace)) continue; // 落宫一致
    if (borrowed.get(palace)?.has(star)) continue; // 空宫借星
    const label = `${star}→${palace}`;
    if (!suspect.includes(label)) suspect.push(label);
  }

  return { suspect, checked };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 机械检查回答是否引入了盘面/原文之外的事实。
 *
 * @param answer 模型回答文本
 * @param input  盘面 + 本次注入的原文
 */
export function verifyAnswer(
  answer: string,
  input: VerifyAnswerInput,
): VerifyAnswerResult {
  const text = answer ?? '';
  const chartStars = chartStarNames(input.chart);
  const chartPalaces = chartPalaceNames(input.chart);
  const sourceText = (input.dimensions ?? []).map((d) => d.text ?? '').join('\n');

  // ── ① 星曜 ─────────────────────────────────────────────
  const suspectStars: string[] = [];
  const ambiguousStars: string[] = [];

  for (const star of REFERENCE_STAR_NAMES) {
    if (!text.includes(star)) continue;
    if (chartStars.has(star)) continue; // 盘里有 → 不报

    const ambiguous = AMBIGUOUS_STAR_NAMES.includes(star);
    if (ambiguous && !hasStarContext(text, star)) {
      ambiguousStars.push(star);
      continue;
    }
    suspectStars.push(star);
  }

  // ── ② 宫位 ─────────────────────────────────────────────
  const suspectPalaces: string[] = [];
  const seenPalace = new Set<string>();

  for (const cand of palaceCandidates(text)) {
    if (NON_PALACE_TERMS.includes(cand.surface)) continue;

    const canonical = canonicalPalaceName(cand.surface);
    if (canonical) {
      if (!chartPalaces.has(canonical) && !seenPalace.has(canonical)) {
        seenPalace.add(canonical);
        suspectPalaces.push(cand.surface);
      }
      continue;
    }

    // 不认识的「X宫」：只有当 X 是星名时，才是明确的「把星曜当宫位」式编造
    if (REFERENCE_STAR_NAMES.includes(cand.stem) && !seenPalace.has(cand.surface)) {
      seenPalace.add(cand.surface);
      suspectPalaces.push(cand.surface);
    }
  }

  // 裸宫名（如「夫妻」「财帛」）也要看一遍
  for (const raw of PALACE_NAMES) {
    if (!text.includes(raw)) continue;
    const canonical = canonicalPalaceName(raw) ?? raw;
    if (!chartPalaces.has(canonical) && !seenPalace.has(canonical)) {
      seenPalace.add(canonical);
      suspectPalaces.push(raw);
    }
  }

  // ── ③ 落宫 ─────────────────────────────────────────────
  const { suspect: suspectPlacements } = checkPlacements(text, input.chart);

  // ── 原文佐证 ───────────────────────────────────────────
  const sourceBackedStars = [...suspectStars, ...ambiguousStars].filter((s) =>
    sourceText.includes(s),
  );

  // ── 提示文案 ───────────────────────────────────────────
  const warnings: string[] = [];
  if (suspectStars.length > 0) {
    warnings.push(
      `以下星曜不在你的盘面中（可能是模型补充，或属于原文举例），请谨慎参考：${suspectStars.join('、')}`,
    );
  }
  if (suspectPalaces.length > 0) {
    warnings.push(
      `以下宫位写法不在你的十二宫中，请谨慎参考：${suspectPalaces.join('、')}`,
    );
  }
  if (suspectPlacements.length > 0) {
    warnings.push(
      `以下星曜落宫与你的盘面不符，请谨慎参考：${suspectPlacements.join('、')}`,
    );
  }
  if (ambiguousStars.length > 0) {
    warnings.push(
      `以下词语在原文里可能是普通词汇而非星曜，未作为疑似项计入：${ambiguousStars.join('、')}`,
    );
  }
  if (sourceBackedStars.length > 0) {
    warnings.push(
      `其中 ${sourceBackedStars.join('、')} 出现在本次引用的解读原文中（属原文举例），并非你的盘面星曜。`,
    );
  }

  return {
    ok:
      suspectStars.length === 0 &&
      suspectPalaces.length === 0 &&
      suspectPlacements.length === 0,
    suspectStars,
    suspectPalaces,
    suspectPlacements,
    ambiguousStars,
    sourceBackedStars,
    warnings,
  };
}

/**
 * ── 误报 / 漏报风险（交付说明里已复述）────────────────────────
 *
 * 误报（会冤枉模型）：
 *  1. 原文举例型误报：数据集原文大量使用「碰上煞星（擎羊、陀罗、火星、铃星…）
 *     就容易…」这种教学式举例。被引用的这些星曜**不在用户盘里**，
 *     会被判为 suspectStars。用 `sourceBackedStars` 可区分（它标出原文出处）。
 *  2. 地支宫误报：模型可能写「你的命宫在酉宫」——「酉宫」是地支宫，
 *     不是十二宫之一。当前实现只在「X 恰是星名」时报警，所以「酉宫」不会被误报。
 *  3. 歧义词：天空/天使/天才/破碎/天马 既是真星名又是常用词。
 *     已用「化忌/同宫/坐守/星曜…」语境标记消歧，无标记时只进 ambiguousStars。
 *  4. 「子宫」既可能是子女宫的地支，也可能是人体器官。已列入 NON_PALACE_TERMS。
 *  5. 落宫误报：模型若把「三方四正」写成「X 在 Y 宫」（本引擎的三方星
 *     并不在 Y 宫），会被 ③ 判为不符。实测数据集 30,588 字里只有 1 处
 *     「X在Y宫」写法（且与盘面一致），所以实际触发面很窄。
 *
 * 漏报（放过编造）：
 *  1. **最大的一个**：本引擎每张盘都摆齐全部 70 个星，模型编造「贪狼」「紫微」
 *     这类 14 主星时，① 抓不到（因为它确实在你盘里）。只能靠 ③ 落宫检查兜一部分，
 *     如果模型只是说「你命宫有贪狼」而不提宫位，就查不出来。
 *     —— 这是基座事实，不是本模块能单独解决的；已在交付说明里上报。
 *  2. 词表外的东西查不到：参照系 = 引擎 70 星 + 30 个标准杂曜/神煞。
 *     超出这个范围的生僻名字不会被抓到。
 *  3. 四化错配不查：模型若说「太阳化忌」而盘里太阳是化禄，当前实现不报警。
 *     （数据集原文本身满是四化举例，硬查四化错配误报率极高，故有意不做。）
 *  4. 宫位名拼写变体不全：词表覆盖常见别名与繁体，未覆盖的写法可能漏过。
 */
