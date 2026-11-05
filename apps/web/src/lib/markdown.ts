/**
 * 轻量 Markdown 解析器 —— 只覆盖数据集里实际出现的构造：
 *
 *   · `## ` 标题                       → heading
 *   · `**【XXX】**` 独占一段           → heading（数据集的维度小标题）
 *   · `**粗体**` / `*斜体*`            → 行内
 *   · `- ` / `· ` 列表项              → list
 *   · `> ` 引用块                      → quote
 *   · `---` 分隔线                     → rule
 *   · 其余自然段（空行分隔）           → paragraph
 *
 * 数据集正文里没有 HTML、没有代码块、没有表格，因此不引入完整的 Markdown 依赖。
 * 解析结果是纯数据，可以同时在服务端与客户端渲染。
 */

export type MdBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_RE = /^\s*(?:[-*+]|·)\s+(.*)$/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
/** `**【命格总览】**` 独占一段时视作小标题 */
const BRACKET_HEADING_RE = /^\*\*(【[^】]+】)\*\*$/;

export function parseMarkdown(src: string): MdBlock[] {
  const text = src.replace(/\r\n/g, '\n');
  const chunks = text.split(/\n[ \t]*\n+/);
  const blocks: MdBlock[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.replace(/[ \t]+$/, ''));
    const meaningful = lines.filter((l) => l.trim().length > 0);
    if (meaningful.length === 0) continue;

    if (meaningful.length === 1 && RULE_RE.test(meaningful[0])) {
      blocks.push({ kind: 'rule' });
      continue;
    }

    if (meaningful.every((l) => /^\s*>/.test(l))) {
      blocks.push({
        kind: 'quote',
        lines: meaningful.map((l) => l.replace(/^\s*>\s?/, '')),
      });
      continue;
    }

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const heading = HEADING_RE.exec(line.trim());
      if (heading) {
        blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
        i += 1;
        continue;
      }

      if (BULLET_RE.test(line)) {
        const items: string[] = [];
        while (i < lines.length) {
          const m = BULLET_RE.exec(lines[i]);
          if (!m) break;
          items.push(m[1]);
          i += 1;
        }
        blocks.push({ kind: 'list', items });
        continue;
      }

      const para: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) break;
        if (HEADING_RE.test(l.trim())) break;
        if (BULLET_RE.test(l)) break;
        para.push(l.trim());
        i += 1;
      }
      if (para.length === 0) {
        i += 1;
        continue;
      }
      if (para.length === 1) {
        const bracket = BRACKET_HEADING_RE.exec(para[0]);
        if (bracket) {
          blocks.push({ kind: 'heading', level: 3, text: bracket[1] });
          continue;
        }
      }
      // 段内换行合并成一段连续文本：数据集原文一段一行，多行只来自模型长回答的
      // 自动折行——逐行 <br> 会把句子拦腰切断、行距参差（中文行文不需要段内换行）。
      // 正文为简体中文大白话，直接拼接不会粘连英文单词。
      blocks.push({ kind: 'paragraph', lines: [para.join('')] });
    }
  }

  return blocks;
}

/** 行内标记：`**粗体**` 与 `*斜体*` */
export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string };

export function parseInline(src: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) spans.push({ kind: 'text', text: src.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ kind: 'strong', text: m[1] });
    else if (m[2] !== undefined) spans.push({ kind: 'em', text: m[2] });
    last = re.lastIndex;
  }
  if (last < src.length) spans.push({ kind: 'text', text: src.slice(last) });
  return spans;
}
