/**
 * 宽度感知的文本排版工具。
 *
 * 中文是全角字符，一个字占两列；用 String.padEnd 会错位，
 * 所以这里自己算「显示宽度」。
 */

const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // 韩文字母
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK 部首 / 标点
    (cp >= 0x3041 && cp <= 0x33ff) || // 假名 / 兼容字符
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 基本区
    (cp >= 0xa000 && cp <= 0xa4cf) || // 彝文
    (cp >= 0xac00 && cp <= 0xd7a3) || // 韩文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 兼容表意
    (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK 兼容形式
    (cp >= 0xff00 && cp <= 0xff60) || // 全角 ASCII
    (cp >= 0xffe0 && cp <= 0xffe6) || // 全角符号
    (cp >= 0x1f300 && cp <= 0x1f9ff) || // 彩色 emoji
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK 扩展 B 及以后
  );
}

/** 字符串的终端显示宽度（忽略 ANSI 转义） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of stripAnsi(text)) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    width += isWideCodePoint(cp) ? 2 : 1;
  }
  return width;
}

/** 按显示宽度右侧补空格 */
export function padEnd(text: string, width: number): string {
  const w = displayWidth(text);
  return w >= width ? text : text + ' '.repeat(width - w);
}

/** 按显示宽度左侧补空格 */
export function padStart(text: string, width: number): string {
  const w = displayWidth(text);
  return w >= width ? text : ' '.repeat(width - w) + text;
}

/** 截断到指定宽度，超出部分用 … 收尾 */
export function truncateWidth(text: string, width: number): string {
  if (displayWidth(text) <= width) return text;
  let out = '';
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const cw = isWideCodePoint(cp) ? 2 : 1;
    if (w + cw > width - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}
