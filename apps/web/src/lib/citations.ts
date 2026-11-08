/**
 * 引文降级策略（展示层）。
 *
 * 背景：解读数据集标注为 CC BY 4.0，但文本中引用的倪海厦《天纪》原话
 * **不在该授权范围内**（属 CC BY-NC-SA 4.0，不可商用）。
 * 实测密度极高 —— 79% 的维度文本含受限引文片段（1990 年前 600 盘、7,800 段文本实测）。
 * 详见 docs/LEGAL_NOTES.md。
 *
 * 设计取舍：
 *  · **默认 `full`**（原样展示）—— 本地自用、演示、研究场景下，
 *    引文是数据集价值的一部分，且保留来源标注即满足 CC BY 的要求。
 *  · 面向**商业分发**时必须切到 `inline` —— 这是 `docs/LEGAL_NOTES.md`
 *    第 5 节列的「商用前必须做的事」第 1 条。
 *  · 无论哪种模式，界面都要**明确告知用户**当前处于哪种模式，
 *    不能让受限引文在不知情的情况下对外呈现。
 *
 * 降级只在**展示层**做；`@ziwei/core` 返回的始终是数据集原文。
 */

import { countCitations, redactCitations } from '@ziwei/citation-guard';

export type CitationMode = 'full' | 'inline' | 'drop-line';

export const CITATION_MODES: CitationMode[] = ['full', 'inline', 'drop-line'];

export const CITATION_MODE_LABEL: Record<CitationMode, string> = {
  full: '完整展示（含《天纪》原话与出处标注） / Full text (incl. Tian Ji quotes with citations)',
  inline: '引文降级为「（引文略）」 / Quotes downgraded to “(quote omitted)”',
  'drop-line': '含引文的整行略去 / Lines containing quotes omitted',
};

/** 从环境变量解析模式；无法识别时回退到 `full` */
export function resolveCitationMode(raw?: string): CitationMode {
  const v = (raw ?? '').trim().toLowerCase();
  if ((CITATION_MODES as string[]).includes(v)) return v as CitationMode;
  return 'full';
}

/**
 * 眼镜端（Rokid AIUI 智能体）专用的模式解析 —— **默认 `inline`，不是 `full`**。
 *
 * 差别只有一个，但很关键：
 *  · Web 端的 `full` 是给本地自用 / 演示 / 研究留的默认值（引文是数据集价值的一部分）；
 *  · 眼镜端是要上架 Rokid 商店的**公开作品**，属于「商业分发」场景，
 *    docs/LEGAL_NOTES.md 第 5 节明确要求商用前切到 `inline`。
 *
 * 如果这里直接复用 `resolveCitationMode`，环境变量没配就会退回 `full`，
 * 等于把受限的《天纪》原话原样推给用户 —— 这是合规事故，不是配置疏漏。
 * 所以口径反过来：**只有显式写 `ZIWEI_CITATION_MODE=full` 才放宽**，
 * 没写、写错、空值一律按 `inline` 处理。
 */
export function resolveAgentCitationMode(raw?: string): CitationMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'full') return 'full';
  if (v === 'drop-line') return 'drop-line';
  return 'inline';
}

/** 眼镜端对外披露用的模式说明（要能让用户看懂当前拿到的文本是什么形态） */
export const AGENT_CITATION_MODE_LABEL: Record<CitationMode, string> = {
  full: '完整展示（含《天纪》原话与出处标注）',
  inline: '引文已降级（《天纪》原话以「引文略」代替）',
  'drop-line': '含引文的整行已略去',
};

export interface CitationApplied {
  /** 处理后的正文 */
  text: string;
  /** 原文里的引文标记数 */
  citations: number;
  /** 是否实际做了降级 */
  redacted: boolean;
}

/** 对一段文本应用降级策略 */
export function applyCitationMode(text: string, mode: CitationMode): CitationApplied {
  const citations = countCitations(text);
  if (mode === 'full' || citations === 0) {
    return { text, citations, redacted: false };
  }
  const redacted = redactCitations(text, mode);
  return { text: redacted, citations, redacted: true };
}

/** 对一组维度应用降级，返回整体统计（保留维度 key 的字面量类型） */
export function applyCitationModeToDimensions<K extends string>(
  dimensions: Array<{ key: K; label: string; text: string; chars: number }>,
  mode: CitationMode,
): { dimensions: Array<{ key: K; label: string; text: string; chars: number }>; totalCitations: number; redactedDims: number } {
  let totalCitations = 0;
  let redactedDims = 0;
  const out = dimensions.map((d) => {
    const citations = countCitations(d.text);
    totalCitations += citations;
    if (mode === 'full' || citations === 0) {
      return { ...d };
    }
    redactedDims += 1;
    return { ...d, text: redactCitations(d.text, mode) };
  });
  return { dimensions: out, totalCitations, redactedDims };
}
