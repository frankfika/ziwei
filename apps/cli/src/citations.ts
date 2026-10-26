/**
 * CLI 侧的引文降级策略。
 *
 * 与 Web 端 `apps/web/src/lib/citations.ts` 是同一套口径的独立实现
 * （CLI 是零依赖包，不引 Web 的代码）。
 *
 * 背景与取舍见 docs/LEGAL_NOTES.md：
 *  · 默认 `full`（完整展示）—— 本地自用 / 演示场景
 *  · 商业分发前必须切 `inline`（环境变量 ZIWEI_CITATION_MODE 或 --citations）
 */

import { countCitations, redactCitations } from '@ziwei/citation-guard';

export type CitationMode = 'full' | 'inline' | 'drop-line';

export const CITATION_MODE_LABEL: Record<CitationMode, string> = {
  full: '完整展示（含《天纪》原话与出处标注）',
  inline: '引文降级为「（引文略）」',
  'drop-line': '含引文的整行略去',
};

/** 解析模式；无法识别时回退到 `full` */
export function resolveCitationMode(raw?: string): CitationMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'inline' || v === 'drop-line' || v === 'full') return v;
  return 'full';
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
