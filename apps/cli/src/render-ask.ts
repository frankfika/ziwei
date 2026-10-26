/**
 * 追问命令的渲染。
 *
 * 输出要让用户一眼看出三件事：
 *  1. 模型答了什么
 *  2. 它引用了哪些维度（可追溯到数据集原文）
 *  3. **机械自检有没有发现越界内容**（星曜/宫位不在盘里）
 */

import type { Theme } from './theme';

export interface AskRenderInput {
  answer: string;
  provider: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  citedDimensions: string[];
  verification: {
    ok: boolean;
    suspectStars?: string[];
    suspectPalaces?: string[];
    suspectPlacements?: string[];
    warnings?: string[];
  };
}

export function renderAsk(input: AskRenderInput, t: Theme): string[] {
  const lines: string[] = [];

  lines.push(t.bold('命盘追问'));
  lines.push(
    `模型 ${input.model ?? input.provider}` +
      (input.usage?.totalTokens
        ? t.dim(`  ·  ${input.usage.totalTokens} tokens`)
        : ''),
  );
  if (input.citedDimensions.length) {
    lines.push(t.dim(`引用维度：${input.citedDimensions.join('、')}`));
  }
  lines.push('');
  lines.push(input.answer);
  lines.push('');

  const suspects = [
    ...(input.verification.suspectStars ?? []),
    ...(input.verification.suspectPalaces ?? []),
    ...(input.verification.suspectPlacements ?? []),
  ];

  if (suspects.length) {
    lines.push(t.yellow('⚠ 机械自检：以下内容不在你的盘面中，请谨慎参考'));
    for (const s of suspects) lines.push(`   · ${s}`);
    lines.push('');
  } else {
    lines.push(t.green('✓ 机械自检：未发现盘面外的星曜/宫位'));
    lines.push('');
  }

  return lines;
}
