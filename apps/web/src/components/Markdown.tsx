import type { ReactNode } from 'react';
import { parseInline, parseMarkdown } from '@/lib/markdown';

function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((span, i) => {
    switch (span.kind) {
      case 'strong':
        return (
          <strong key={i} className="font-semibold text-ink">
            {span.text}
          </strong>
        );
      case 'em':
        return (
          <em key={i} className="italic text-ink-2">
            {span.text}
          </em>
        );
      default:
        return <span key={i}>{span.text}</span>;
    }
  });
}

/**
 * 解读正文渲染器。
 *
 * 解读文本来自开源数据集原文，这里只做排版，不改写、不摘要、不补充。
 */
export default function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);

  return (
    <div className="text-ink-2">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            if (block.level <= 2) {
              return (
                <h2
                  key={i}
                  className="mt-8 border-t border-lineSoft pt-5 text-base font-semibold tracking-[0.12em] text-ink first:mt-0 first:border-0 first:pt-0"
                >
                  {renderInline(block.text)}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3
                  key={i}
                  className="mt-6 text-sm font-semibold tracking-wide text-ink first:mt-0"
                >
                  {renderInline(block.text)}
                </h3>
              );
            }
            return (
              <h4 key={i} className="mt-4 text-xs font-semibold text-ink-2">
                {renderInline(block.text)}
              </h4>
            );
          }
          case 'paragraph':
            return (
              <p key={i} className="my-3 text-[15px] leading-[1.95] tracking-[0.01em] sm:text-base">
                {block.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {renderInline(line)}
                  </span>
                ))}
              </p>
            );
          case 'list':
            return (
              <ul key={i} className="my-3 space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[15px] leading-[1.9] sm:text-base">
                    <span className="mt-[0.72em] h-1 w-1 shrink-0 rounded-full bg-ink-3/60" />
                    <span className="min-w-0">{renderInline(item)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="my-4 border-l-2 border-zhu/40 bg-zhu-soft/40 px-4 py-3 text-[14px] leading-[1.9] text-ink-2"
              >
                {block.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {renderInline(line)}
                  </span>
                ))}
              </blockquote>
            );
          case 'rule':
            return <hr key={i} className="my-7 border-t border-line" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
