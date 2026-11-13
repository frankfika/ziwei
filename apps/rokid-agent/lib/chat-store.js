/**
* 对话面数据模型 —— 「盘面 + 对话」这个产品结构的规则层。
*
* ⚠️ 为什么要单独抽一层：
* 界面上「对话」这块有三条规则，是**产品决定**，不是渲染细节：
*
*  1. 屏幕上最多留几轮 —— 多留会挤爆 480×352 的单绿屏，少了用户接不上话；
*  2. 盘面页中宫只放得下一问一答的**摘要**（长文放不下，要给摘要）；
*  3. 盘面页单击替用户生成的第一问（一条**不用说话**就能用的路径）。
*
* 这三条以前全埋在页面方法里，既没法单测，改起来也不敢下手。
* 现在抽成纯函数模块 —— 页面只管渲染，数据规则在这里，改一条测一条。
*
* 纯函数 + 显式状态：不依赖 AIUI 运行时，可以在 node 里直接单测。
*/

/* ------------------------------------------------------------------ *
* 动作类型
* ------------------------------------------------------------------ */

/**
* 一轮回答的来源。
*
* ⚠️ 两种来源必须分开标，因为它们的服务端契约不同：
*  · `reading` —— **数据集原文检索**（13 维解读，出自《天纪》原文，附引文模式披露）；
*  · `ask` —— **模型生成**（自由追问，附引文模式披露）。
*
* 项目硬规则：解读正文必须来自数据集原文，不允许模型凭空生成。
* 所以「盘面页单击（问这一宫）」走 reading，「对话页语音提问」走 ask，
* 两者都进同一条会话流 —— 用户看到的是「我在跟它说话」，不是「我在查两个不同的东西」。
*/
export const TURN_KIND = Object.freeze({
  READING: 'reading',
  ASK: 'ask'
});

/* ------------------------------------------------------------------ *
* 规则参数
* ------------------------------------------------------------------ */

/** 屏幕上最多保留几轮对话（更早的丢掉） */
export const MAX_TURNS = 3;

/** 中宫摘要区，答案最多几个字 */
export const SUMMARY_MAX = 28;

/** 一轮问题的最大长度（超出截断，防止一句长话撑爆会话流） */
export const QUESTION_MAX = 60;

/**
* 建议语 —— 给「不想开口」的用户留一条路。
*
* 为什么必须留：眼镜上没有键盘，唯一能问问题的通道是语音。
* 而语音在嘈杂环境里识别率不稳定（社区实测：一句含混的话识别正确率不到一半）。
* 只有语音路径 = 只要识别失败一次，用户就彻底问不了。
* 建议语 = 「不依赖识别的兜底路径」，也是演示时最稳的路径。
*/
export const SUGGESTIONS = Object.freeze([
  '今年事业怎么样',
  '我适合做什么',
  '今年要注意什么',
  '和家人相处要注意什么'
]);

/* ------------------------------------------------------------------ *
* 文本工具
* ------------------------------------------------------------------ */

/**
* 把任意空白压成单个空格，并去掉首尾空白。
*
* @param {unknown} text
* @returns {string}
*/
export function collapse(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
* 截断成摘要（超长加省略号）。
*
* @param {unknown} text
* @param {number} [max]
* @returns {string}
*/
export function summarize(text, max = SUMMARY_MAX) {
  const s = collapse(text);
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
* 规整一句问题：压空白、去句尾标点、限长。
*
* ⚠️ 去句尾标点不是为了好看 —— 识别结果常常带「。」「？」，
* 而后端的问题文本会进模型 prompt，多余标点会让「今年怎么样？」和
* 「今年怎么样」在缓存/去重上变成两条不同的记录。
*
* @param {unknown} text
* @param {number} [max]
* @returns {string} 规整后的问题；空串表示「没有有效问题」
*/
export function normalizeQuestion(text, max = QUESTION_MAX) {
  let s = collapse(text);
  s = s.replace(/[。．.！!？?，,、；;：:\s]+$/g, '');
  if (s.length > max) s = s.slice(0, max);
  return s;
}

/* ------------------------------------------------------------------ *
* 一轮对话
* ------------------------------------------------------------------ */

/**
* 盘面页单击时替用户生成的第一问。
*
* ⚠️ 为什么是「替用户问」而不是「让用户先说话」：
* 盘面页是用户看到的第一样东西，此刻他手上只有一张陌生的盘，
* 还不知道该问什么。此时要求他开口 = 第一分钟就卡住。
* 替用户问一句「这一宫怎么样」，他立刻看到一问一答的样子，
* 也立刻明白「这东西会跟我说话」—— 想问别的，单击对话页就能自己说。
*
* @param {string} palaceName 宫名（例：命宫、财帛宫）
* @returns {string}
*/
export function palaceQuestion(palaceName) {
  const name = collapse(palaceName);
  if (!name) return '这张盘，今年怎么样？';
  /**
   * 「命宫」已经带「宫」字，不能再补一个 ——
   * 补了就是「命宫宫」，读出来很怪，用户一看就觉得是 bug。
   *
   * ⚠️ 判据是「**末尾是不是宫字**」，不是「长度是不是大于 2」：
   * 「命宫」只有两个字，按长度判会被漏掉（2026-11-12 真错过一次）。
   */
  const label = name.slice(-1) === '宫' ? name : `${name}宫`;
  return `${label}，今年怎么样？`;
}

/**
* 新建一轮对话。
*
* @param {Object} options
* @param {string} options.question
* @param {string} [options.kind] TURN_KIND.READING | TURN_KIND.ASK
* @param {string} [options.focus] 焦点说明（宫位 · 时间层）
* @returns {Object} 一轮对话
*/
export function createTurn({ question, kind = TURN_KIND.READING, focus = '' } = {}) {
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    question: normalizeQuestion(question),
    kind: kind === TURN_KIND.ASK ? TURN_KIND.ASK : TURN_KIND.READING,
    focus: collapse(focus),
    answer: '',
    citation: '',
    /** 等待服务端回答中 */
    pending: true,
    /** 回答失败（界面上给「重试」入口） */
    failed: false
  };
}

/**
* 追加一轮，并只保留最近 `max` 轮。
*
* 为什么要丢旧的：480×352 的屏放不下更多轮；
* 而且会话流的价值在「最近这一问一答」，更早的轮次已经在后端上下文里（`_askTurns`）。
*
* @param {Array<Object>} turns
* @param {Object} turn
* @param {number} [max]
* @returns {Array<Object>} 新的数组
*/
export function appendTurn(turns, turn, max = MAX_TURNS) {
  const next = (Array.isArray(turns) ? turns : []).concat([turn]);
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
* 找到一轮对话在数组里的下标（按 id）。
*
* @param {Array<Object>} turns
* @param {string} id
* @returns {number} 找不到返回 -1
*/
export function indexOfTurn(turns, id) {
  if (!Array.isArray(turns)) return -1;
  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i] && turns[i].id === id) return i;
  }
  return -1;
}

/**
* 最近一轮（屏幕中宫摘要用）。
*
* @param {Array<Object>} turns
* @returns {Object|null}
*/
export function lastTurn(turns) {
  if (!Array.isArray(turns) || turns.length === 0) return null;
  return turns[turns.length - 1];
}

/**
* 一轮对话 → 视图模型（单轮）。
*
* @param {Object} t
* @returns {Object}
*/
function viewTurn(t) {
  const sourceLabel = t.kind === TURN_KIND.ASK ? '推演' : '原文';
  /**
   * 兼容两种形状：**内部轮次**（question/answer）与**视图模型**（q/a）。
   *
   * 为什么需要兼容：预览视频脚本（`scripts/preview-html.mjs`）
   * 拿到的就是视图模型，它要用**和页面同一份**分段逻辑，
   * 不能各写一份 —— 两份必然漂移成「文档里的界面」和「眼镜上的界面」。
   */
  const question = typeof t.question === 'string' ? t.question : typeof t.q === 'string' ? t.q : '';
  const answer = typeof t.answer === 'string' ? t.answer : typeof t.a === 'string' ? t.a : '';
  /**
   * 标注行：**一行**说清「这一轮是哪来的、问的是哪一块、有没有降级引文」。
   *
   * ⚠️ 为什么必须挤在一行：
   * `.turn-meta` 是 `display:flex; flex-direction:row`，
   * 多个 text 会**并排**而不是换行 ——
   * 分成两行反而会连成「…命格总览引文正常」这种糊在一起的东西。
   * 对话页正文宽 456px，一行放得下（十几字）。
   */
  const meta = [];
  if (t.focus) meta.push(t.focus);
  if (t.citation) meta.push(t.citation);
  return {
    id: t.id,
    q: question,
    a: answer,
    kind: t.kind,
    focus: t.focus,
    citation: t.citation,
    pending: Boolean(t.pending),
    failed: Boolean(t.failed),
    /** 答案摘要（中宫用） */
    short: summarize(answer),
    /** 来源标签：原文 / 推演 */
    sourceLabel,
    /** 界面上的标注行 */
    metaLine: meta.length ? `${sourceLabel}　${meta.join('　')}` : sourceLabel
  };
}

/**
* 会话流 → 界面视图模型。
*
* 为什么要单独转一层：模板里要做「短摘要」「空态」「失败态」的分支，
* 这些判断放在渲染函数里就没法单测。
*
* @param {Array<Object>} turns
* @returns {Array<Object>} 视图模型数组
*/
export function viewTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.map((t) => viewTurn(t));
}

/* ------------------------------------------------------------------ *
* 正文分段
* ------------------------------------------------------------------ */

/**
* 判断一段正文该用哪种样式。
*
* ⚠️ **判据为什么这么定**：
* 数据集原文的段落结构是固定的（实测 `/api/agent/reading` 返回）：
*
*   【命格总览】\n\n你心里的事比外人看到的复杂得多。……\n\n
*   【一句话定调】\n\n有福、日子过得舒服；……\n\n
*   关键推导（倪师断法引擎 · 可回溯引文略）：\n· （引文略）贪狼化权：……
*
* 也就是三种段：**小标题**、**正文段**、**列表项**。
* 绿屏上只有四档亮度、没有颜色 ⇒ 层级只能靠**字重**和**段距**拉开。
*
* @param {string} t
* @returns {string} 样式类
*/
export function paragraphClass(t) {
  const s = typeof t === 'string' ? t.trim() : '';
  if (!s) return 'turn-p';
  /** 列表项：「·」「•」「・」开头的推导条目 */
  if (/^[·•・]/.test(s)) return 'turn-li';
  /**
   * 小标题：**整段就是一个方括号标签**（`【命格总览】`）。
   *
   * ⚠️ 判据必须是「整段都是标签」而不是「以【开头」——
   * 列表项里就有 `【火星(急躁·突发)】遇紫微→解厄制化` 这种，
   * 按「以【开头」判会被误当成标题。
   */
  if (/^【[^】]{1,16}】$/.test(s)) return 'turn-h';
  /** 「关键推导（…）：」这种「短句 + 冒号」也是小标题 */
  if (s.length <= 28 && /[：:]$/.test(s)) return 'turn-h';
  return 'turn-p';
}

/**
* 把一段正文切成**渲染单元**。
*
* ⚠️ **为什么必须切段，不能整段塞给渲染层**：
* 2026-11-13 在 AIUI Studio 的**真实 ink 运行时**里实测过 ——
* ink 的 `<text>` **不认 `\n`**：一段 1400 字的解读会被排成一整坨，
* `【一句话定调】`/`【核心论断】` 这些小标题全部内联到句子中间，
* 用户根本看不出哪里是段落。
* 纯文本化（`lib/plain-text.js`）保留了换行（实测 81 → 81 个 `\n`），
* 但**渲染层不吃** ⇒ 只能把换行变成**结构**：一段一个 `<text>`。
*
* @param {unknown} text
* @returns {Array<{ i: number, t: string, cls: string }>}
*/
export function splitParagraphs(text) {
  const raw = typeof text === 'string' ? text : '';
  const parts = raw
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((t, i) => ({ i, t, cls: paragraphClass(t) }));
}

/**
* 会话流 → **扁平的渲染行**。
*
* ⚠️ **为什么是扁平的一维列表，而不是「轮次里再套段落」**：
* ink 的 `ink:for` 嵌在 `ink:for` 里面没有把握（真实运行时未验证），
* 而一维列表只用了一层 `ink:for` —— **能确定的才写进页面**。
*
* ⚠️ **为什么最新一轮在最上面**：
* 480×352 的滚动区只有 256px（≈13 行），一段解读有 30 行上下。
* 如果按时间正序，用户提完问题、答案落在**最底下**，
* 屏幕上看过去是**旧内容**，而等待的那 15~60 秒里屏幕**一动不动**——
* 这正是「交互和逻辑全是问题」里最扎人的一种。
* 倒序之后：新一轮永远在最上面，滚动位置 0 就是「我刚问的这段」的开头。
*
* @param {Array<Object>} turns
* @returns {Array<{ id: string, cls: string, text: string }>}
*/
export function viewRows(turns) {
  const list = Array.isArray(turns) ? turns : [];
  const rows = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const v = viewTurn(list[i]);
    if (!v) continue;
    const newest = rows.length === 0;
    rows.push({
      id: `${v.id}-meta`,
      cls: `turn-tag${newest ? ' newest' : ' sep'}`,
      text: newest ? `最新　${v.metaLine}` : v.metaLine
    });
    rows.push({ id: `${v.id}-q`, cls: 'turn-q', text: v.q });
    if (v.pending) {
      rows.push({ id: `${v.id}-body`, cls: 'turn-p loading', text: '正在推演……' });
    } else if (v.failed) {
      rows.push({ id: `${v.id}-body`, cls: 'turn-p failed', text: v.a });
    } else {
      const paras = splitParagraphs(v.a);
      if (!paras.length) {
        rows.push({ id: `${v.id}-body`, cls: 'turn-p', text: v.a });
        continue;
      }
      for (const p of paras) {
        rows.push({ id: `${v.id}-p${p.i}`, cls: p.cls, text: p.t });
      }
    }
  }
  return rows;
}

/**
* 盘面页中宫的摘要：一问一答。
*
* @param {Array<Object>} turns
* @returns {{ question: string, answer: string, empty: boolean }}
*/
export function digestOf(turns) {
  const last = lastTurn(turns);
  if (!last) return { question: '', answer: '', empty: true };
  return {
    question: last.question,
    answer: last.pending ? '正在推演……' : summarize(last.answer),
    empty: false
  };
}

/**
* 建议语轮转（双击换一条）。
*
* @param {Array<string>} list
* @param {number} index
* @param {number} delta
* @returns {number} 新的下标
*/
export function nextSuggestionIndex(list, index, delta) {
  const n = Array.isArray(list) ? list.length : 0;
  if (n === 0) return 0;
  const cur = Number.isFinite(index) ? index : 0;
  return ((cur + delta) % n + n) % n;
}
