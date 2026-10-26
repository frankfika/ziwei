/**
 * @ziwei/citation-guard
 *
 * 倪海厦《天纪》引文检测与降级处理。
 *
 * ── 为什么需要这个 ──────────────────────────────────────────────
 *   解读数据集 v4.0 标注为 CC BY 4.0，但它文本中**引用的倪海厦《天纪》原话**
 *   不在该授权范围内 —— 上游 README 明确写了这一点，那些引文要单独成批使用
 *   须按 CC BY-NC-SA 4.0（即不可商用）处理。
 *
 *   实测密度极高：1990 年前 200 张盘里就有 7814 处《天纪》相关标记。
 *
 * ── 「受限」与「自有」的分界（本模块的核心判断）──────────────────
 *
 *   受限（商业分发时必须降级）：
 *     · 《天纪》标记本身、定位符（第5集53:06 / p05 00:49:01 / 53:06）
 *     · 与上述标记**紧邻**的引号原话「…」
 *     · 只由上述内容构成的出处标注括号，如（倪海厦《天纪》第5集53:06）
 *     · 〔倪师断法·格局〕这类整块归属标注
 *
 *   自有（保留，在数据集 CC BY 4.0 范围内）：
 *     · 叙述句里的「倪师说」「按倪师」「倪师提醒」—— 这是数据集自己的转述，
 *       不是《天纪》原话逐字引用
 *     · 不含《天纪》标记的括号，如免责声明、口径说明
 *
 *   早期版本把「倪师」二字一律当引文抹掉，实测产生了三类破坏：
 *     「但倪师说法不同」        → 「但（引文略）法不同」   （语义破碎）
 *     「传统以土应脾胃（倪师断疾厄…不作病断）」 → 免责声明括号被嵌套破坏
 *     「（倪海厦《天纪》第5集53:06）」→「（（引文略））」（括号不配对）
 *
 *   现在按上面的分界重做，并保证降级后**括号始终配对**。
 *
 * 合规判断的责任在人，本模块只做机械检测与机械降级。
 * 详见 ../../docs/LEGAL_NOTES.md
 */

/** 一处引文命中（受限片段） */
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

/** 顶层替换占位符（前后自行配对） */
export const CITATION_PLACEHOLDER = '（引文略）';
/** 括号内局部替换占位符（不带括号，避免产生嵌套括号） */
export const CITATION_PLACEHOLDER_INNER = '引文略';

/**
 * 定位符模式。
 * 数据集里的实际写法（实测样本）：
 *   《天纪》第5集53:06   第7集27:56   《天纪》p07 00:50:17
 *   倪师《天纪》p05 00:49:01、00:52:09   同集12:56
 *
 * 注意「第N集」是定位符的**前缀**，必须一并纳入 —— 早期版本漏了它，
 * 降级后残留「第5集」这种半截内容。
 */
const LOCATOR_RE =
  /(?:第\d{1,3}集\s*)?(?:p\d{1,3}\s*)?\d{1,2}:\d{2}(?::\d{2})?/g;

/** 显式《天纪》引用 */
const TIANJI_RE = /(?:\u300a天纪\u300b|\u5929\u7eaa(?:\u539f\u8bdd|\u8bdd|\u96c6\u6570)?)/g;

/** 「倪师」式署名表述 */
const NI_LABEL_RE =
  /(?:\u502a\u5e08(?:\u65ad\u6cd5|\u8bf4|\u660e\u8a00|\u5f00\u5c01|\u8bed\u6c14|\u8bf4\u6cd5|\u7ecf\u9a8c|\u65ad\u8bcd)?|\u6309\u502a\u5e08|\u502a\u6d77\u53a6)/g;

/** 整块标注，如〔倪师断法·格局〕 */
const BRACKET_RULE_RE = /\u3014\u502a\u5e08[^\u3015\u300b]*\u3015/g;

/**
 * 括号配对表。深度计算、括号扩展都依赖它。
 *
 * 「」《》也算括号 —— 它们既是书名号/引号，也参与配对判断
 * （《天纪》整体就是一个括号包住受限内容）。
 */
const BRACKET_PAIRS: Record<string, string> = {
  '\uFF08': '\uFF09', // （ ）
  '(': ')',
  '\u3010': '\u3011', // 【 】
  '\u3014': '\u3015', // 〔 〕
  '\u300C': '\u300D', // 「 」
  '\u300A': '\u300B', // 《 》
  '\u201C': '\u201D', // “ ”
  '\u2018': '\u2019', // ‘ ’
};

const CLOSE_TO_OPEN: Record<string, string> = Object.fromEntries(
  Object.entries(BRACKET_PAIRS).map(([open, close]) => [close, open]),
);

/**
 * 「可跳过」字符集：命中标记与锚点之间只允许出现这些字符时，
 * 才认为两者是紧邻绑定关系。
 *
 * 里面**不含**中文，所以「倪师说天府是文官星」不会被误绑到后面的《天纪》。
 */
const SEPARATOR_RE =
  /^[\s\u3001\u3002,\uFF0C\u00B7\uFF1A:\uFF1B;\u3000\u2014\u2013\-\/\u2022\u3002\u2026\uFF08\uFF09()\[\]\u3010\u3011\u3014\u3015\u300C\u300D\u300A\u300B\u201C\u201D\u2018\u2019"']*$/;

/**
 * 合并相邻受限片段时允许跨越的分隔符。
 *
 * 刻意**不包含**换行符与「·」：
 *   · 换行 —— 跨行合并会把两条 bullet 连成一个片段，第二行的项目符号被吞掉
 *   · 「·」 —— 数据集里它既是行首项目符号，也是括号内的分隔符，跨它合并不安全
 * 「、」保留，因为定位符之间就是用它并列的（p05 00:49:01、00:52:09）。
 */
const MERGE_SEPARATOR_RE =
  /^[ \t\u3001,\uFF0C\uFF1A:\uFF1B;]*$/;

/** 一对配对的括号 */
interface BracketPair {
  open: number;
  close: number;
}

/**
 * 扫描文本，找出所有配对的括号。
 *
 * 数据集里存在少数括号不配对的样本（校勘批注里混入了半截括号），
 * 所以这里必须容错：遇到找不到配对开括号的闭括号就跳过，
 * 遇到被闭括号截断的开括号就丢弃。
 */
export function matchBrackets(text: string): BracketPair[] {
  const stack: Array<{ ch: string; idx: number }> = [];
  const pairs: BracketPair[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (BRACKET_PAIRS[c]) {
      stack.push({ ch: c, idx: i });
      continue;
    }
    const want = CLOSE_TO_OPEN[c];
    if (!want) continue;
    let found = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].ch === want) {
        found = k;
        break;
      }
    }
    if (found === -1) continue; // 落单的闭括号，忽略
    const open = stack[found];
    stack.length = found; // 丢掉这个开括号，以及它上面失配的开括号
    pairs.push({ open: open.idx, close: i });
  }
  return pairs;
}

/**
 * 计算每个位置被多少对括号包裹（严格在内部才算）。
 *
 * 用于决定替换占位符要不要自带括号：已经在括号内部时再用「（引文略）」
 * 会产生嵌套括号。
 */
function computeDepth(text: string): number[] {
  const depth = new Array<number>(text.length + 1).fill(0);
  for (const p of matchBrackets(text)) {
    for (let i = p.open + 1; i < p.close; i++) depth[i] += 1;
  }
  return depth;
}

/**
 * 检测文本中属于《天纪》引用体系的**受限片段**。
 *
 * 返回按起始位置排序、互不重叠的命中列表。
 *
 * 「受限」的口径见文件头的说明：只有《天纪》标记、定位符、与之紧邻的
 * 引号原话、以及由它们构成的出处标注括号算受限；叙述句里的「倪师说」
 * 这类转述不算。
 */
export function findCitations(text: string): CitationHit[] {
  if (!text) return [];

  const n = text.length;
  const mask = new Array<boolean>(n).fill(false);
  // 用三个布尔数组记录 kind，不用单一数组 —— TypeScript 会对数组元素做
  // 类型收窄，导致 `kinds[i] === 'tianji-explicit'` 被判为「无交集」报错。
  const isExplicit = new Array<boolean>(n).fill(false);
  const isBracketRule = new Array<boolean>(n).fill(false);
  const isNiLabel = new Array<boolean>(n).fill(false);

  const mark = (s: number, e: number, kind: CitationKind) => {
    for (let i = s; i < e; i++) {
      mask[i] = true;
      if (kind === 'tianji-explicit') isExplicit[i] = true;
      else if (kind === 'bracket-rule') isBracketRule[i] = true;
      else if (kind === 'ni-label') isNiLabel[i] = true;
    }
  };

  // ── 1. 锚点：必然受限 ──────────────────────────────────────
  const scan = (re: RegExp, kind: CitationKind) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      mark(m.index, m.index + m[0].length, kind);
    }
  };
  scan(TIANJI_RE, 'tianji-explicit');
  scan(LOCATOR_RE, 'tianji-locator');
  scan(BRACKET_RULE_RE, 'bracket-rule');

  // ── 2. 署名标签绑定：只有紧邻锚点时才算受限 ─────────────────
  // 「倪海厦《天纪》」中的「倪海厦」是出处的一部分 → 受限；
  // 「本平台批盘按倪师」中的「按倪师」是数据集自己的说法 → 保留。
  for (let round = 0; round < 3; round++) {
    NI_LABEL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let bound = false;
    while ((m = NI_LABEL_RE.exec(text)) !== null) {
      if (m[0].length === 0) {
        NI_LABEL_RE.lastIndex += 1;
        continue;
      }
      const s = m.index;
      const e = s + m[0].length;
      if (isBoundToAnchor(text, mask, s, e)) {
        mark(s, e, 'ni-label');
        bound = true;
      }
    }
    if (!bound) break;
  }

  // ── 3. 括号扩展 + 引号绑定，迭代到不动点 ────────────────────
  const pairs = matchBrackets(text);
  for (let round = 0; round < 8; round++) {
    let changed = false;

    // 3a. 括号内部若全是受限内容 → 整个括号（含括号本身）受限
    for (const p of pairs) {
      if (mask[p.open] && mask[p.close]) continue;
      let allMasked = true;
      let hasContent = false;
      for (let i = p.open + 1; i < p.close; i++) {
        if (/\s/.test(text[i])) continue;
        hasContent = true;
        if (!mask[i]) {
          allMasked = false;
          break;
        }
      }
      if (hasContent && allMasked) {
        mark(p.open, p.close + 1, 'tianji-explicit');
        changed = true;
      }
    }

    // 3b. 引号原话：紧邻受限内容时，整段引号受限
    for (const p of pairs) {
      if (mask[p.open]) continue;
      const isQuote = text[p.open] === '\u300C' || text[p.open] === '\u201C';
      if (!isQuote) continue;

      let right = p.close + 1;
      while (right < n && /\s/.test(text[right])) right++;
      if (right < n && mask[right]) {
        mark(p.open, p.close + 1, 'tianji-explicit');
        changed = true;
        continue;
      }

      let left = p.open - 1;
      while (left >= 0 && /\s/.test(text[left])) left--;
      if (left >= 0 && mask[left]) {
        mark(p.open, p.close + 1, 'tianji-explicit');
        changed = true;
      }
    }

    if (!changed) break;
  }

  // ── 4. 切出受限区间并合并 ───────────────────────────────────
  const spans = mergeSpans(text, mask);
  if (!spans.length) return [];

  // ── 5. 归类 ────────────────────────────────────────────────
  return spans.map((sp) => {
    let kind: CitationKind = 'tianji-locator';
    let sawBracketRule = false;
    let sawNiLabel = false;
    for (let i = sp.s; i < sp.e; i++) {
      if (isExplicit[i]) { kind = 'tianji-explicit'; break; }
      if (isBracketRule[i]) sawBracketRule = true;
      if (isNiLabel[i]) sawNiLabel = true;
    }
    if (kind === 'tianji-locator') {
      if (sawBracketRule) kind = 'bracket-rule';
      else if (sawNiLabel) kind = 'ni-label';
    }
    const hit: CitationHit = {
      start: sp.s,
      end: sp.e,
      text: text.slice(sp.s, sp.e),
      kind,
    };
    const loc = LOCATOR_RE.exec(text.slice(sp.s, sp.e));
    if (loc) hit.locator = loc[0].trim();
    LOCATOR_RE.lastIndex = 0;
    return hit;
  });
}

/**
 * 标记是否与锚点「紧邻」绑定。
 *
 * 紧邻 = 中间只隔着分隔符（空白、标点、括号），且不超过 8 个字符。
 * 这个预算很重要 —— 「本平台批盘按倪师」距离前一个定位符只有 8 个字符，
 * 如果只看「同处一个括号」就会被误绑。
 */
function isBoundToAnchor(text: string, mask: boolean[], s: number, e: number): boolean {
  const MAX_GAP = 8;

  let i = e;
  let steps = 0;
  while (i < text.length && steps < MAX_GAP) {
    if (mask[i]) return true;
    if (!SEPARATOR_RE.test(text[i])) return false;
    i += 1;
    steps += 1;
  }

  i = s - 1;
  steps = 0;
  while (i >= 0 && steps < MAX_GAP) {
    if (mask[i]) return true;
    if (!SEPARATOR_RE.test(text[i])) return false;
    i -= 1;
    steps += 1;
  }
  return false;
}

/** 把掩码切成区间，并合并仅隔分隔符的相邻区间 */
function mergeSpans(text: string, mask: boolean[]): Array<{ s: number; e: number }> {
  const raw: Array<{ s: number; e: number }> = [];
  let i = 0;
  while (i < mask.length) {
    if (mask[i]) {
      const s = i;
      while (i < mask.length && mask[i]) i += 1;
      raw.push({ s, e: i });
    } else {
      i += 1;
    }
  }
  if (!raw.length) return [];

  const merged: Array<{ s: number; e: number }> = [];
  for (const sp of raw) {
    const last = merged[merged.length - 1];
    if (last) {
      const gap = text.slice(last.e, sp.s);
      if (gap.length <= 4 && MERGE_SEPARATOR_RE.test(gap)) {
        last.e = sp.e;
        continue;
      }
    }
    merged.push({ s: sp.s, e: sp.e });
  }
  return merged;
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
 *   已经在括号内部的片段用不带括号的「引文略」，保证括号始终配对。
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

/**
 * 把受限片段替换为占位符。
 *
 * 已经在括号内部的片段用不带括号的占位符 —— 否则会出现
 * 「（（引文略）引擎 · 可回溯（引文略））」这种嵌套括号。
 */
function stripHits(text: string, hits: CitationHit[]): string {
  const depth = computeDepth(text);
  let out = '';
  let cursor = 0;
  for (const hit of hits) {
    out += text.slice(cursor, hit.start);
    out += depth[hit.start] > 0 ? CITATION_PLACEHOLDER_INNER : CITATION_PLACEHOLDER;
    cursor = hit.end;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * 按段落（空行分隔）降级。
 *
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
