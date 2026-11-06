/**
 * 眼镜端（Rokid AIUI 智能体）专用的引文降级工具。
 *
 * 背景：解读数据集本身是 CC BY 4.0，但正文里引用的倪师《天纪》原话
 * **不在该授权范围内**（CC BY-NC-SA 4.0，不可商用）。
 * 眼镜端是要上架 Rokid 商店的**公开作品**，属于商业分发场景，
 * docs/LEGAL_NOTES.md 第 5 节要求商用前切到 `inline`。
 *
 * 为什么单独一个文件（而不是写在 route.ts 里）：
 *  · Next.js 对 route 文件的导出有白名单校验，不能随便导出辅助函数；
 *  · 这套逻辑是**眼镜端的合规红线**，必须能脱离 route 单独跑测试。
 */

import { redactCitations } from '@ziwei/citation-guard';
import type { Birth, ReadingLookup, ZiweiService } from '@ziwei/core';

import type { CitationMode } from './citations';
/**
 * 眼镜端追加到系统提示末尾的约束 —— 许可红线。
 *
 * 为什么单独加：共享的 ASK_SYSTEM_PROMPT 是给「本地自用 / 研究」写的，
 * 里面明确鼓励模型「在原文基础上叠加自己的专业判断」。
 * 但眼镜端是上架商店的商业分发场景，《天纪》原话不可商用，
 * 必须再压一道：**只讲机制，不复述原话**。
 */
export const AGENT_SYSTEM_EXTRA = [
  '（眼镜端许可约束）',
  '- 材料里凡是标着「引文略」的地方，是前人原话中不可引用的部分：不要猜测、不要复原、不要用近义句替它把原话讲出来。',
  '- 只用自己的话讲星曜机制与组合逻辑，绝不逐字复述材料中的引文原句，也不添加任何出处标注。',
  '- 材料没写到的，一律不补：宁可说「这一点我推不准」，也不要把别处的说法当成这里的结论。',
].join('\n');

/**
 * 包一层服务：解读原文**先降级再进提示词**。
 *
 * 为什么在**输入层**降级（而不是只在输出层）：
 *  · AskService 会把维度原文拼进提示词，**模型看到什么就会说什么**；
 *  · 输出层只能挡住带《天纪》标记的片段，模型自己复述出来的原话（不带标记）照样漏出去；
 *  · 输入层降级后，模型根本没见过那段原文，复述无从谈起。
 *
 * 口径：`mode` 必须由 resolveAgentCitationMode 解析（**默认 inline**）。
 * 注意不能直接用 Web 端的 resolveCitationMode —— 那个默认 full，
 * 等于把受限原文原样塞进提示词再送给模型，是最坏的一种漏法。
 *
 * @param base 原始服务（通常是 getService() 单例，保留年份索引缓存）
 * @param mode 降级模式
 * @returns 只在 reading/full 上做降级的服务替身
 */
export function redactingService(base: ZiweiService, mode: CitationMode): ZiweiService {
  const redact = (text: string): string =>
    mode === 'full' ? text : redactCitations(text, mode);

  const redactLookup = (r: ReadingLookup): ReadingLookup =>
    r.status === 'ok'
      ? { ...r, dimensions: r.dimensions.map((d) => ({ ...d, text: redact(d.text) })) }
      : r;

  return {
    index: base.index,
    chart: (birth: Birth) => base.chart(birth),
    summary: (birth: Birth) => base.summary(birth),
    reading: (birth: Birth) => redactLookup(base.reading(birth)),
    full: (birth: Birth) => {
      const r = base.full(birth);
      return { ...r, reading: redactLookup(r.reading) };
    },
    coverage: () => base.coverage(),
  };
}
