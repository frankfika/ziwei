/**
 * reasoning（思维链）文本处理。
 *
 * 为什么要专门处理：
 *  · 大量模型（MiniMax-M3 / DeepSeek-R1 / QwQ 等）在 OpenAI 兼容接口里
 *    把思维链**塞进 `content`**，形如 `<think>…</think>\n\n正式回答`。
 *  · 这些块若原样透出：
 *    ① 会污染给用户看的答案；
 *    ② 会**污染防编造自检** —— 思维链里常出现「我需要检查命宫有没有贪狼」
 *       这类盘面外的星名，会被机械检查误判为「模型编造了贪狼」。
 *  · 所以：**默认从正文里剥掉，原始内容留在 `raw` 里供审计**。
 */

/** 提取并移除思维链块。 */
export interface ReasoningSplit {
  /** 剥离思维链后的正文 */
  text: string;
  /** 抽出的思维链原文（可能有多个块，用空行连接） */
  reasoning: string;
}

const THINK_BLOCK_RE = /<(think|thinking|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/** 单独的未闭合开标签（流式截断时可能出现） */
const THINK_OPEN_RE = /<(think|thinking|reasoning)\b[^>]*>[\s\S]*$/i;

/**
 * 从文本中剥离思维链。
 *
 * @param text 原始正文
 * @returns 正文（已剥离）+ 思维链原文
 */
export function splitReasoning(text: string): ReasoningSplit {
  if (!text) return { text: '', reasoning: '' };

  const blocks: string[] = [];
  const stripped = text.replace(THINK_BLOCK_RE, (_m, _tag, body: string) => {
    blocks.push(body.trim());
    return '';
  });

  // 未闭合的尾部思维链（模型被 max_tokens 截断时常见）
  const afterOpen = stripped.replace(THINK_OPEN_RE, '');

  const reasoning = blocks.filter(Boolean).join('\n\n');
  return {
    text: afterOpen.replace(/^\s+|\s+$/g, ''),
    reasoning,
  };
}

/** 只要正文，不要思维链。 */
export function stripReasoning(text: string): string {
  return splitReasoning(text).text;
}

/**
 * 流式思维链剥离器 —— 边收边剥。
 *
 * 非流式用 `splitReasoning` 就够了；流式下思维链和正文混在同一个 `content` 里
 * 逐块到达，必须**边收边判断**：还在 `<think>` 块里的一律不吐给用户，
 * 只有块后面的正文才吐。
 *
 * 用法：`push(chunk)` 返回可安全显示的增量，`flush()` 收尾。
 */
export class ReasoningStripper {
  /** 还没判定归属的尾巴（可能包含跨块切开的标签） */
  private buf = '';
  /** 当前是否在思维链块内 */
  private inThink = false;

  /** 吃进一块增量，返回可以显示给用户的部分 */
  push(chunk: string): string {
    this.buf += chunk;
    let out = '';

    for (;;) {
      if (this.inThink) {
        const close = this.buf.search(/<\/(think|thinking|reasoning)>/i);
        if (close < 0) {
          // 还没闭合：整块都是思维链，全部扣住
          this.buf = '';
          return out;
        }
        const end = this.buf.indexOf('>', close) + 1;
        this.buf = this.buf.slice(end);
        this.inThink = false;
        continue;
      }

      const open = this.buf.search(/<(think|thinking|reasoning)\b[^>]*>/i);
      if (open >= 0) {
        out += this.buf.slice(0, open);
        const end = this.buf.indexOf('>', open) + 1;
        this.buf = this.buf.slice(end);
        this.inThink = true;
        continue;
      }

      // 没有开标签：可能标签被切在两块之间，末尾留一点缓冲再吐
      const keep = Math.max(0, this.buf.length - 12);
      out += this.buf.slice(0, keep);
      this.buf = this.buf.slice(keep);
      return out;
    }
  }

  /** 流结束：把剩下的正文吐出来（还在思维链里就丢掉） */
  flush(): string {
    const rest = this.inThink ? '' : this.buf;
    this.buf = '';
    this.inThink = false;
    return rest;
  }
}
