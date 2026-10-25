/**
 * @ziwei/citation-guard
 *
 * 倪海厦《天纪》引文检测与降级处理。
 *
 * 为什么需要这个：
 *   解读数据集 v4.0 标注为 CC BY 4.0，但它文本中**引用的倪海厦《天纪》原话**
 *   不在该授权范围内 —— 上游 README 明确写了这一点，那些引文要单独成批使用
 *   须按 CC BY-NC-SA 4.0（即不可商用）处理。
 *
 *   实测密度极高：1990 年前 200 张盘里就有 7814 处《天纪》相关标记。
 *
 * 本模块的策略（对应实施简报第 3 节「展示层如遇明显引文块可降级为『略』或跳过」）：
 *   · **检测**出引文块
 *   · 提供**降级**手段：整块替换为「（引文略）」，或整段跳过
 *   · 默认**不自动改写** —— 由调用方显式选择策略
 *
 * 合规判断的责任在人，本模块只做机械检测与机械降级。
 * 详见 ../../docs/LEGAL_NOTES.md
 */

/** 一处引文命中 */
export interface CitationHit {
  /** 在原文中的起始偏移 */
  start: number;
  /** 结束偏移（不含） */
  end: number;
  /** 命中的原文片段 */
  text: string;
  /** 命中的类型 */
  kind: CitationKind;
  /** 识别出的时间码 / 集数标注（若有） */
  locator?: string;
}

export type CitationKind =
  | 'tianji-explicit'    // 显式出现「天纪」「《天纪》」
  | 'tianji-locator'     // 形如 p05 00:49:01 / 第5集53:06 的定位符
  | 'ni-label'           // 形如「倪师断法」「倪师说」「按倪师」的署名式表述
  | 'bracket-rule';      // 形如〔倪师断法·格局〕的整块标注

/**
 * 定位符模式。
 * 数据集里的实际写法（实测样本）：
 *   《天纪》第5集53:06   第7集27:56   《天纪》p07 00:50:17
 *   倪师《天纪》p05 00:49:01、00:52:09
 */
const LOCATOR_RE =
  /(?:\u300a天纪\u300b\s*)?(?:p\d{1,3}\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[\u3001\u3002,，]?\s*(?:p\d{1,3}\s*)?\d{1,2}:\d{2}(?::\d{2})?)?\s*(?:\u7b2c\d+\u96c6)?/g;

/** 显式《天纪》引用 */
const TIANJI_RE = /(?:\u300a天纪\u300b|\u5929\u7eaa(?:\u539f\u8bdd|\u8bdd|\u96c6\u6570)?)/g;

/** 「倪师」式署名表述 */
const NI_LABEL_RE =
  /(?:\u502a\u5e08(?:\u65ad\u6cd5|\u8bf4|\u660e\u8a00|\u5f00\u5c01|\u8bed\u6c14|\u8bf4\u6cd5|\u7ecf\u9a8c|\u65ad\u8bcd)?|\u6309\u502a\u5e08|\u502a\u6d77\u53a6)/g;

/** 整块标注，如〔倪师断法·格局〕 */
const BRACKET_RULE_RE = /\u3014\u502a\u5e08[^\u3015\u300b]*\u3015/g;

/** 需要一并吞掉的整段（含 Markdown 强调、列表符号等） */
const LINE_PREFIX_RE = /^[\s>*_\-#|`\u3000]*/;

/**
 * 检测文本中的《天纪》引文。
 *
 * 返回按起始位置排序、互不重叠的命中列表。
 * 同一段文字可能同时命中多种模式 —— 优先返回更「长」的命中（引文块优先于标签）。
 */
export function findCitations(text: string): CitationHit[] {
  if (!text) return [];

  const raw: CitationHit[] = [];

  const push = (re: RegExp, kind: CitationKind, keepLocator: boolean) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      const start = m.index;
      const end = m.index + m[0].length;
      const locatorMatch = keepLocator ? LOCATOR_RE.exec(m[0]) : null;
      raw.push({
        start,
        end,
        text: m[0],
        kind,
        ...(locatorMatch ? { locator: locatorMatch[0].trim() } : {}),
      });
    }
  };

  push(BRACKET_RULE_RE, 'bracket-rule', false);
  push(TIANJI_RE, 'tianji-explicit', true);
  push(NI_LABEL_RE, 'ni-label', false);
  push(LOCATOR_RE, 'tianji-locator', false);

  // 按 start 排序；同起点时长的优先
  raw.sort((a, b) => a.start - b.start || b.end - b.end);

  // 向左吞掉紧邻的引号原话：数据集里引文通常是「原话」（出处标注）这种形式，
  // 出处标记在引号之后，只删标记会留下原话。
  for (const hit of raw) {
    if (hit.kind === 'tianji-locator' || hit.kind === 'bracket-rule') continue;
    const extended = extendOverQuotedSpeech(text, hit);
    if (extended !== null) {
      hit.start = extended;
      hit.text = text.slice(hit.start, hit.end);
    }
  }

  raw.sort((a, b) => a.start - b.start || b.end - b.end);

  // 合并重叠：保留外层更长的一段
  const merged: CitationHit[] = [];
  for (const hit of raw) {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) {
      if (hit.end > last.end) {
        last.end = hit.end;
        last.text = text.slice(last.start, last.end);
        if (hit.kind === 'tianji-explicit') last.kind = 'tianji-explicit';
      }
      continue;
    }
    merged.push({ ...hit });
  }
  return merged;
}

/** 闭合引号 → 起始引号 */
const QUOTE_PAIRS: Array<[string, string]> = [
  ['」', '「'],
  ['”', '“'],
  ['"', '"'],
  ["'", "'"],
];

/**
 * 若命中标记前面紧邻一段被引号包裹的原话，把命中起点向左扩到引号开头。
 * 例：`「我们简单讲就是后天」（倪海厦《天纪》第9集12:22）`
 *      标记命中从「（」开始，向左扩到「「」开头，原话整段被覆盖。
 */
function extendOverQuotedSpeech(text: string, hit: CitationHit): number | null {
  let i = hit.start - 1;
  // 跳过标记与引号之间的空白与括号
  while (i >= 0 && /[\s（(【[]/.test(text[i])) i -= 1;
  if (i < 0) return null;

  for (const [close, open] of QUOTE_PAIRS) {
    if (text[i] !== close) continue;
    const openIdx = text.lastIndexOf(open, i - 1);
    if (openIdx === -1) continue;
    // 引文不应过长（超过 400 字符多半是误匹配）
    if (i - openIdx > 400) continue;
    return openIdx;
  }
  return null;
}

/** 统计引文数量 */
export function countCitations(text: string): number {
  return findCitations(text).length;
}

/** 是否含有引文 */
export function hasCitations(text: string): boolean {
  return findCitations(text).length > 0;
}

/** 降级策略 */
export type RedactionMode =
  /** 把引文块替换为「（引文略）」，保留其余文字 */
  | 'inline'
  /** 整行含引文的行整行跳过 */
  | 'drop-line'
  /** 整段（含引文块）全部跳过 */
  | 'drop-block';

/**
 * 按策略降级处理引文。
 *
 * - `inline`：把命中的引文原文替换为占位符，其余文字不动。
 * - `drop-line`：任何一行命中引文就整行丢弃（适合 Markdown 断语列表）。
 * - `drop-block`：把整段文本丢弃（适合整段都是引文的情况）。
 */
export function redactCitations(text: string, mode: RedactionMode = 'inline'): string {
  if (!text) return text;
  const hits = findCitations(text);
  if (!hits.length) return text;

  if (mode === 'drop-block') {
    return '';
  }

  if (mode === 'drop-line') {
    const lines = text.split('\n');
    const out: string[] = [];
    for (const line of lines) {
      const lineHits = findCitations(line);
      if (lineHits.length === 0) {
        out.push(line);
        continue;
      }
      // 行内还有非引文内容？只丢引文部分，否则整行丢
      const withoutCitations = stripHits(line, lineHits);
      if (withoutCitations.trim().length === 0) continue;
      out.push(withoutCitations);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  return stripHits(text, hits).replace(/\n{3,}/g, '\n\n').trim();
}

function stripHits(text: string, hits: CitationHit[]): string {
  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    out += text.slice(cursor, hit.start);
    out += '（引文略）';
    cursor = hit.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * 按段落（空行分隔）降级。
 * 段落里任一处有引文，整个段落按 mode 处理。
 */
export function redactByParagraph(text: string, mode: RedactionMode = 'inline'): string {
  if (!text) return text;
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  for (const p of paras) {
    if (hasCitations(p)) {
      out.push(redactCitations(p, mode));
    } else {
      out.push(p);
    }
  }
  return out.join('\n\n').trim();
}

/** 统计整个数据集样本里各维度的引文密度，用于评估展示层降级的影响 */
export function citationStats(dimensions: Array<{ label: string; text: string }>) {
  return dimensions.map((d) => ({
    label: d.label,
    hits: countCitations(d.text),
    chars: d.text.length,
  }));
}
