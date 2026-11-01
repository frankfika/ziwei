/**
 * 提示词构造 —— **纯函数**，不依赖网络、不依赖 provider。
 *
 * 组装三块材料：
 *   ① 盘面事实（`chartSummary()` 的输出）—— 唯一权威盘面来源
 *   ② 检索到的相关维解读原文节选 —— 唯一可引用的解读来源
 *   ③ 硬约束（system）—— 禁止编造星曜/宫位、禁止医疗/投资/法律断言、禁止自称占卜大师
 *
 * 原文节选按「问题关键词命中的维度优先 + 上下文预算截断」选取，
 * 每段都带来源标注（维度名 + 原文起止字数），便于 UI 展示与模型引用。
 */

import { DIMENSION_LABELS, READING_DIMENSIONS, type Birth } from '@ziwei/core';

/** 参与追问的一条解读原文（与 `ReadingDimensionEntry` 结构兼容）。 */
export interface PromptDimension {
  key: string;
  label: string;
  text: string;
  chars?: number;
}

/** 本会话中此前的一轮问答（用于让模型理解追问语境，不作为引用材料）。 */
export interface AskTurn {
  question: string;
  answer: string;
}

export interface BuildAskPromptInput {
  /** 用户生辰 */
  birth: Birth;
  /** 用户问题 */
  question: string;
  /** `chartSummary(birth)` 的输出 */
  chartSummary: string;
  /** 检索到的解读维度原文 */
  dimensions: PromptDimension[];
  /** 本会话此前的问答（时间正序）；超出上限的较早轮次会被丢弃 */
  turns?: AskTurn[];
  /** 注入材料的上下文预算（字符数）。默认 8000 */
  maxContextChars?: number;
  /**
   * 页内追问的显式焦点（用户从某个解读维度/宫位发起追问）。
   * 给了就不再只靠关键词猜：焦点维度无条件置顶注入。
   */
  focus?: AskFocus;
  /** 运限事实（流年/大限），由 service 用引擎数据生成，原样附在盘面事实之后 */
  fortuneNote?: string;
}

/** 页内追问焦点：来自哪个解读维度 / 哪个宫位 / 哪个时间层。 */
export interface AskFocus {
  /** 解读维度 key（如 'love'）；未知 key 会被忽略 */
  dimension?: string;
  /** 宫位名（如 '夫妻'）；经 PALACE_TO_DIMENSION 映射到维度 */
  palace?: string;
  /** 时间层：liunian=流年（配合 targetYear），daxian=当前大限 */
  time?: 'liunian' | 'daxian';
  /** time 为 liunian 时的目标公历年，默认当年 */
  targetYear?: number;
}

/** 焦点维度的加分：压过一切关键词命中，确保置顶注入。 */
const FOCUS_SCORE = 100;

/** 一条维度在本次追问中的使用情况。 */
export interface SelectedDimension {
  key: string;
  label: string;
  /** 是否被问题关键词命中 */
  matched: boolean;
  /** 命中的关键词 */
  matchedKeywords: string[];
  /** 该维原文总字数 */
  totalChars: number;
  /** 实际注入的字数 */
  includedChars: number;
  /** 是否被截断 */
  truncated: boolean;
  /** 注入片段在原文中的起止偏移（半开区间） */
  startChar: number;
  endChar: number;
}

export interface BuiltPrompt {
  /** 系统提示（硬约束） */
  system: string;
  /** 用户提示（问题 + 材料） */
  user: string;
  /** 本次实际使用的维度清单（按注入顺序） */
  selected: SelectedDimension[];
  /** 注入材料的总字符数 */
  contextChars: number;
  /** 上下文预算 */
  maxContextChars: number;
}

/** 默认上下文预算：盘面摘要 + 原文节选合计的字符上限。 */
export const DEFAULT_MAX_CONTEXT_CHARS = 8000;

/** 单个维度节选的上限（避免单维吃满预算）。 */
const PER_DIMENSION_CAP = 3000;

/** 预算里预留给标题/标注/问句的余量。 */
const LABEL_RESERVE = 400;

/** 对话上文：最多带入的轮数，以及整个上文块的字符上限。 */
const MAX_HISTORY_TURNS = 6;
const HISTORY_BLOCK_CAP = 2400;
/** 上文中单条问答的截断长度（问题 / 回答）。 */
const HISTORY_QUESTION_CAP = 200;
const HISTORY_ANSWER_CAP = 500;

/**
 * 把此前的问答渲染成【对话上文】块。
 * 取最近 MAX_HISTORY_TURNS 轮，逐条截断；整体超限时从最旧的轮次开始丢。
 */
function buildHistoryBlock(turns: AskTurn[]): string {
  const recent = turns.filter((t) => t.question?.trim() && t.answer?.trim()).slice(-MAX_HISTORY_TURNS);
  const lines: string[] = [];
  let total = 0;
  // 从最新往回装，装不下就停 —— 保住最近的语境
  for (let i = recent.length - 1; i >= 0; i--) {
    const q = recent[i].question.trim().slice(0, HISTORY_QUESTION_CAP);
    const a = recent[i].answer.trim().slice(0, HISTORY_ANSWER_CAP);
    const entry = `问：${q}\n答：${a}`;
    if (total + entry.length > HISTORY_BLOCK_CAP) break;
    lines.unshift(entry);
    total += entry.length;
  }
  return lines.join('\n\n');
}

/**
 * 维度关键词表 —— 问题命中即优先注入该维原文。
 * 键 = 解读维度 key（与数据集 `c` 字段一一对应）。
 */
export const DIMENSION_KEYWORDS: Record<string, string[]> = {
  overview: ['总览', '整体', '概览', '全局', '命格', '格局', '总体', '整体格局', '命盘总'],
  personality: ['性格', '个性', '脾气', '秉性', '性情', '品性', '天赋', '优点', '缺点', '为人', '处事', '性情'],
  love: ['感情', '爱情', '恋爱', '婚姻', '结婚', '配偶', '另一半', '对象', '情感', '桃花', '婚恋', '伴侣', '感情运', '脱单', '分手', '配偶宫'],
  career: ['事业', '工作', '职业', '职场', '升职', '跳槽', '创业', '公司', '上司', '领导', '前途', '官禄', '升迁', '职场'],
  wealth: ['财运', '财富', '挣钱', '赚钱', '收入', '理财', '破财', '偏财', '正财', '薪资', '经济', '花钱', '财帛'],
  health: ['健康', '身体', '疾病', '养生', '体质', '受伤', '手术', '康复', '寿元', '疾厄', '体检'],
  family: ['兄弟', '姐妹', '手足', '同辈', '兄弟姐妹'],
  children: ['子女', '孩子', '小孩', '儿女', '生育', '怀孕', '后代', '子女宫'],
  move: ['迁移', '外出', '旅行', '出差', '移民', '搬家', '外地', '驿马', '搬迁', '出国'],
  friends: ['人际', '朋友', '社交', '同事', '交友', '下属', '人脉', '贵人', '仆役'],
  home: ['田宅', '房产', '房子', '住宅', '家居', '不动产', '买房', '宅', '田宅宫'],
  spirit: ['福德', '精神', '心态', '心理', '享受', '福气', '内心', '情绪'],
  parents: ['父母', '父亲', '母亲', '爸妈', '长辈', '双亲', '父母宫'],
};

/**
 * 宫名 → 维度。用户在问题里点名某个宫时，也把对应维度拉进来。
 */
export const PALACE_TO_DIMENSION: Record<string, string> = {
  '命宫': 'overview',
  '兄弟': 'family',
  '夫妻': 'love',
  '子女': 'children',
  '财帛': 'wealth',
  '疾厄': 'health',
  '迁移': 'move',
  '仆役': 'friends',
  '交友': 'friends',
  '奴仆': 'friends',
  '官禄': 'career',
  '事业': 'career',
  '田宅': 'home',
  '福德': 'spirit',
  '父母': 'parents',
};

/** system 提示：硬约束。 */
export const ASK_SYSTEM_PROMPT = [
  '你是「紫微助手」的命盘追问助手。你只能依据下方提供的【命盘事实】与【解读原文节选】回答用户的问题。',
  '',
  '必须遵守的硬约束（不可违反）：',
  '1. 【命盘事实】是盘面事实的唯一来源。只允许使用其中明确出现的星曜、宫位、四化。材料里没有的星曜或宫位，一律不得提及。',
  '2. 【解读原文节选】是解读的唯一来源。把原文的意思用自己的话讲清楚，不要照抄大段原文。',
  '3. 不确定就说不确定：材料没有写明的内容，直接说「这部分材料里没有写」，不得推测、不得补全、不得用你自身的紫微斗数知识填空。',
  '4. 不得预测或建议医疗、法律、投资、财务的具体结果。涉及此类问题时，只说明命理材料中的一般倾向，并声明不构成建议。',
  '5. 不得自称占卜大师、不得声称能够预测命运、不得使用「必然」「注定」「一定会」这类断言。',
  '6. 用简体中文、大白话回答，像命理师当面跟人聊：先给直接结论，再用一两句说依据。星曜、宫位等术语第一次出现时，顺手用白话解释一句（比如「官禄宫，就是管事业的宫位」）。',
  '7. 回答里不要出现「来源：XX」「数据集」「原文节选」「检索」这类内部说法 —— 用户只关心结论和分析。',
  '8. 若用户的问题超出材料范围，第一句就说明「这部分材料里没有写」，不要先给猜测再解释。',
  '9. 你只依据给定材料解读这张具体的命盘，不得把结论推广到用户没问的其它命盘。',
  '10. 若提供了【对话上文】，它只用于理解用户当前问题的语境（例如「那财运呢」指的是同一张盘）；上文中的表述不是可引用材料，回答仍只能依据【命盘事实】与【解读原文节选】。',
].join('\n');

interface ScoredDimension {
  dim: PromptDimension;
  score: number;
  matched: boolean;
  keywords: string[];
}

/** 给某个维度打分：问题里出现了多少关键词（按出现次数加权）。 */
function scoreDimension(dim: PromptDimension, question: string): ScoredDimension {
  const keywords = DIMENSION_KEYWORDS[dim.key] ?? [];
  const hits: string[] = [];
  let score = 0;
  for (const kw of keywords) {
    if (!kw) continue;
    let count = 0;
    let idx = question.indexOf(kw);
    while (idx !== -1) {
      count += 1;
      idx = question.indexOf(kw, idx + kw.length);
    }
    if (count > 0) {
      hits.push(kw);
      score += count;
    }
  }
  return { dim, score, matched: score > 0, keywords: hits };
}

/** 问题里点名了哪些宫。 */
function mentionedPalaces(question: string): string[] {
  const found: string[] = [];
  for (const palace of Object.keys(PALACE_TO_DIMENSION)) {
    if (question.includes(palace)) found.push(palace);
  }
  return found;
}

/**
 * 在字符预算内截断一段原文，尽量在段落边界断开。
 * 返回截断后的文本与它在原文中的偏移。
 */
export function truncateText(
  text: string,
  cap: number,
): { text: string; startChar: number; endChar: number; truncated: boolean } {
  if (cap <= 0) return { text: '', startChar: 0, endChar: 0, truncated: text.length > 0 };
  if (text.length <= cap) {
    return { text, startChar: 0, endChar: text.length, truncated: false };
  }

  // 优先在段落（空行）边界断开
  const paragraphs = text.split(/\n\s*\n/);
  let acc = '';
  let consumed = 0;
  for (const p of paragraphs) {
    const piece = acc ? `${acc}\n\n${p}` : p;
    if (piece.length > cap) break;
    acc = piece;
    consumed += (acc ? 2 : 0) + p.length;
  }
  if (acc.length > 0) {
    return { text: acc, startChar: 0, endChar: consumed, truncated: true };
  }

  // 第一段就超预算 —— 硬切
  return { text: text.slice(0, cap), startChar: 0, endChar: cap, truncated: true };
}

/**
 * 构造追问提示词（纯函数）。
 *
 * @param birth 用户生辰
 * @param question 用户问题
 * @param chartSummary `chartSummary(birth)` 的输出（盘面事实）
 * @param dimensions 检索到的解读原文
 * @param maxContextChars 注入材料的字符预算，默认 8000
 */
export function buildAskPrompt(input: BuildAskPromptInput): BuiltPrompt {
  const {
    birth,
    question,
    chartSummary,
    dimensions,
    turns,
    maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
    focus,
    fortuneNote,
  } = input;

  const q = (question ?? '').trim();

  // 对话上文（在预算前先算出来，占用同一份上下文预算）
  const historyBlock = turns && turns.length > 0 ? buildHistoryBlock(turns) : '';

  // ① 打分并排序
  const scored: ScoredDimension[] = dimensions.map((d) => scoreDimension(d, q));
  const palaces = mentionedPalaces(q);
  for (const s of scored) {
    for (const palace of palaces) {
      if (PALACE_TO_DIMENSION[palace] === s.dim.key) {
        s.score += 2;
        s.matched = true;
        if (!s.keywords.includes(`宫位:${palace}`)) s.keywords.push(`宫位:${palace}`);
      }
    }
  }

  // ①b 显式焦点：页内追问传来的维度/宫位无条件置顶（不再靠关键词猜）
  if (focus?.dimension) {
    const target = scored.find((s) => s.dim.key === focus.dimension);
    if (target) {
      target.score += FOCUS_SCORE;
      target.matched = true;
      if (!target.keywords.includes('焦点维度')) target.keywords.push('焦点维度');
    }
  }
  if (focus?.palace && PALACE_TO_DIMENSION[focus.palace]) {
    const target = scored.find((s) => s.dim.key === PALACE_TO_DIMENSION[focus.palace!]);
    if (target) {
      target.score += FOCUS_SCORE;
      target.matched = true;
      if (!target.keywords.includes(`焦点宫位:${focus.palace}`))
        target.keywords.push(`焦点宫位:${focus.palace}`);
    }
  }

  const order = new Map(READING_DIMENSIONS.map((k, i) => [k as string, i]));
  const rank = (s: ScoredDimension) => {
    const oi = order.get(s.dim.key);
    return oi === undefined ? 999 : oi;
  };
  scored.sort((a, b) => (b.score - a.score) || (rank(a) - rank(b)));

  // ② 没有任何维度命中时，退回「命格总览」作为唯一锚点
  let picked = scored.filter((s) => s.matched && s.dim.text.length > 0);
  if (picked.length === 0) {
    const fallback = scored.find(
      (s) => s.dim.key === 'overview' && s.dim.text.length > 0,
    ) ?? scored.find((s) => s.dim.text.length > 0);
    if (fallback) picked = [fallback];
  }

  // ③ 预算分配
  const summaryChars = (chartSummary ?? '').length;
  const historyChars = historyBlock.length;
  const snippetBudget = Math.max(
    0,
    maxContextChars - summaryChars - historyChars - (fortuneNote?.length ?? 0) - LABEL_RESERVE,
  );
  const perDim = picked.length
    ? Math.max(600, Math.floor(snippetBudget / picked.length))
    : 0;

  const selected: SelectedDimension[] = [];
  const blocks: string[] = [];
  let remaining = snippetBudget;

  for (const s of picked) {
    if (remaining <= 0) break;
    const cap = Math.min(PER_DIMENSION_CAP, remaining);
    const t = truncateText(s.dim.text, cap);
    if (!t.text) continue;
    const total = s.dim.chars ?? s.dim.text.length;
    selected.push({
      key: s.dim.key,
      label: s.dim.label || DIMENSION_LABELS[s.dim.key as never] || s.dim.key,
      matched: s.matched,
      matchedKeywords: s.keywords,
      totalChars: total,
      includedChars: t.text.length,
      truncated: t.truncated,
      startChar: t.startChar,
      endChar: t.endChar,
    });
    blocks.push(
      [
        `[来源：${s.dim.label || s.dim.key} | key=${s.dim.key} | 原文第 ${
          t.startChar + 1
        }–${t.endChar} 字 / 共 ${total} 字${t.truncated ? '，此处为节选' : ''}]`,
        t.text,
      ].join('\n'),
    );
    remaining -= t.text.length;
  }

  // ④ 渲染
  const birthLine =
    `${birth.year}年${birth.month}月${birth.day}日 ` +
    `时辰序号 ${birth.hour}（${birth.gender === 'male' ? '男' : '女'}）`;

  const user = [
    '【命盘事实】（由确定性排盘引擎生成，是盘面事实的唯一来源；生辰：' +
      birthLine +
      '）',
    chartSummary ?? '',
    ...(fortuneNote
      ? ['', '【运限事实】（由确定性排盘引擎生成的流年/大限层，与本命盘叠加看）', fortuneNote]
      : []),
    '',
    '【解读原文节选】（来自「紫微斗数开源解读数据集 v4.0」（CC BY 4.0，作者：王多鱼AI）；' +
      '以下为按问题相关性选取的节选，可能已被截断）',
    ...(blocks.length > 0 ? blocks : ['（本次未检索到可引用的解读原文：所有内容必须回答「原文未写」。）']),
    ...(historyBlock
      ? [
          '',
          '【对话上文】（本轮追问此前已问过的问题与回答；仅供理解语境，不是可引用材料）',
          historyBlock,
        ]
      : []),
    '',
    '【用户问题】',
    q,
    '',
    '【回答要求】',
    '- 只使用上面【命盘事实】与【解读原文节选】中出现的信息。',
    '- 用大白话把依据讲清楚，不要照抄大段原文，不要写「来源：XX」之类的标注。',
    '- 材料未覆盖的部分，明确说「这部分材料里没有写」，不要猜测。',
  ].join('\n');

  return {
    system: ASK_SYSTEM_PROMPT,
    user,
    selected,
    contextChars:
      summaryChars + historyChars + (fortuneNote?.length ?? 0) +
      selected.reduce((s, d) => s + d.includedChars, 0),
    maxContextChars,
  };
}
