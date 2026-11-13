/**
 * 眼镜端**对话面**回归 —— 挂进回归套件。
 *
 * ── 这套测试守的是什么 ───────────────────────────────────────────
 * 2026-11-12 把眼镜端从「一个页面 + 三个互斥整屏浮窗」重做成
 * 「盘面页 / 对话页 / 生辰录入页」，核心是**把对话面做出来**：
 *
 *  · 盘面页中宫 = **常驻对话区**（最近一问一答一直在屏幕上）；
 *  · 对话页 = **会话流**（多轮问答都在，顶部保留盘面缩略带）；
 *  · 提问从「只能选预设」改成**可以开口说话**，同时保留建议语兜底。
 *
 * 这些规则以前全埋在页面方法里，既没法单测，改起来也不敢下手。
 * 现在抽到 `lib/chat-store.js`（纯函数），这里把每一条钉死。
 *
 * ── 为什么这些细节值得单测 ───────────────────────────────────────
 *  · 「命宫宫」这种一眼可见的错字（2026-11-12 真出现过）；
 *  · 摘要截断 —— 中宫只有 220px 宽，不截断会把提示行挤出屏幕；
 *  · 会话流只留 3 轮 —— 多留挤爆屏，少了接不上话；
 *  · 建议语轮转 —— 用户连按双击就是连问，不能卡在同一句上。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Tester } from './harness';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHAT_STORE = path.join(REPO_ROOT, 'apps/rokid-agent/lib/chat-store.js');
const LAYOUT = path.join(REPO_ROOT, 'apps/rokid-agent/lib/chart-layout.js');

type ChatStore = typeof import('../apps/rokid-agent/lib/chat-store.js');
type Layout = typeof import('../apps/rokid-agent/lib/chart-layout.js');

const chatStore = (await import(CHAT_STORE)) as ChatStore;
const layout = (await import(LAYOUT)) as Layout;

export const suite: SuiteFn = async (t) => {
  /* ================= 问题文本 ================= */

  await t.test('替用户生成的第一问：宫名已经有「宫」字就不再补', () => {
    /**
     * 回归：「命宫」+「宫」= 「命宫宫」，读出来很怪，用户一看就觉得是 bug。
     * 这个错在 2026-11-12 的交互模拟里真出现过一次。
     */
    assert.equal(chatStore.palaceQuestion('命宫'), '命宫，今年怎么样？');
    assert.equal(chatStore.palaceQuestion('财帛宫'), '财帛宫，今年怎么样？');
    assert.ok(!chatStore.palaceQuestion('命宫').includes('宫宫'));
    assert.equal(chatStore.palaceQuestion(''), '这张盘，今年怎么样？');
  });

  await t.test('问题规整：压空白、去句尾标点、限长', () => {
    assert.equal(chatStore.normalizeQuestion('  今年怎么样？  '), '今年怎么样');
    assert.equal(chatStore.normalizeQuestion('今年事业如何。'), '今年事业如何');
    assert.equal(chatStore.normalizeQuestion(''), '');
    assert.equal(chatStore.normalizeQuestion(null), '');
    const long = '问'.repeat(200);
    assert.equal(chatStore.normalizeQuestion(long).length, chatStore.QUESTION_MAX);
  });

  await t.test('摘要截断：超长加省略号，短的不动', () => {
    assert.equal(chatStore.summarize('短句'), '短句');
    const long = '字'.repeat(80);
    const cut = chatStore.summarize(long, 10);
    assert.equal(cut.length, 10);
    assert.ok(cut.endsWith('…'));
    /** 空白必须压掉 —— 识别结果常带换行 */
    assert.equal(chatStore.summarize('  一句\n话  '), '一句 话');
  });

  /* ================= 一轮对话 ================= */

  await t.test('新建一轮：默认是数据集原文、等待中', () => {
    const turn = chatStore.createTurn({ question: '命宫，今年怎么样？' });
    assert.equal(turn.kind, chatStore.TURN_KIND.READING);
    assert.equal(turn.pending, true);
    assert.equal(turn.failed, false);
    assert.equal(turn.answer, '');
    assert.ok(turn.id.length > 0);
  });

  await t.test('会话流只留最近 3 轮', () => {
    /**
     * 480×352 的单绿屏放不下更多轮；而更早的轮次已经在后端上下文里，
     * 不必留在屏幕上。
     */
    let turns: ReturnType<typeof chatStore.createTurn>[] = [];
    for (let i = 0; i < 6; i += 1) {
      turns = chatStore.appendTurn(turns, chatStore.createTurn({ question: `第${i}问` }));
    }
    assert.equal(turns.length, chatStore.MAX_TURNS);
    assert.equal(turns[turns.length - 1].question, '第5问');
  });

  await t.test('按 id 找到那一轮', () => {
    const a = chatStore.createTurn({ question: '甲' });
    const b = chatStore.createTurn({ question: '乙' });
    const turns = chatStore.appendTurn(chatStore.appendTurn([], a), b);
    assert.equal(chatStore.indexOfTurn(turns, a.id), 0);
    assert.equal(chatStore.indexOfTurn(turns, b.id), 1);
    assert.equal(chatStore.indexOfTurn(turns, '不存在'), -1);
  });

  await t.test('视图模型标注来源（原文 / 推演）', () => {
    /**
     * 两种回答的服务端契约不同（数据集原文检索 vs 模型生成），
     * 界面上必须能看出这一轮是哪一种。
     */
    const reading = chatStore.createTurn({ question: '甲', kind: chatStore.TURN_KIND.READING });
    const ask = chatStore.createTurn({ question: '乙', kind: chatStore.TURN_KIND.ASK });
    const views = chatStore.viewTurns([reading, ask]);
    assert.equal(views[0].sourceLabel, '原文');
    assert.equal(views[1].sourceLabel, '推演');
  });

  await t.test('中宫摘要：等待中显示「正在推演……」，空会话返回空态', () => {
    const empty = chatStore.digestOf([]);
    assert.equal(empty.empty, true);
    assert.equal(empty.question, '');
    assert.equal(empty.answer, '');

    const pending = chatStore.createTurn({ question: '甲' });
    const d1 = chatStore.digestOf([pending]);
    assert.equal(d1.empty, false);
    assert.equal(d1.question, '甲');
    assert.equal(d1.answer, '正在推演……');

    const done = { ...pending, pending: false, answer: '这是回答' };
    assert.equal(chatStore.digestOf([done]).answer, '这是回答');
  });

  /* ================= 建议语 ================= */

  await t.test('建议语：非空、都是字符串、轮转不越界', () => {
    /**
     * 建议语是**不依赖语音识别的兜底路径** ——
     * 眼镜上没有键盘，语音是唯一提问通道，而语音在嘈杂环境里识别率不稳定。
     * 只有语音路径 = 识别失败一次，用户就彻底问不了。
     */
    assert.ok(chatStore.SUGGESTIONS.length >= 3, '建议语至少 3 条');
    for (const s of chatStore.SUGGESTIONS) {
      assert.equal(typeof s, 'string');
      assert.ok(s.trim().length > 0);
    }
    const n = chatStore.SUGGESTIONS.length;
    assert.equal(chatStore.nextSuggestionIndex(chatStore.SUGGESTIONS, 0, 1), 1);
    assert.equal(chatStore.nextSuggestionIndex(chatStore.SUGGESTIONS, n - 1, 1), 0);
    assert.equal(chatStore.nextSuggestionIndex(chatStore.SUGGESTIONS, 0, -1), n - 1);
    assert.equal(chatStore.nextSuggestionIndex([], 0, 1), 0);
  });

  /* ================= 宫名短名 ================= */

  await t.test('宫名短名：三字宫名去掉「宫」，两字宫名原样', () => {
    /**
     * 对话页顶部的盘面缩略带是 12 格横排，每格只有 38px 宽。
     * 「财帛宫」三个字在 11px 字号下约 33px，几乎顶满一格，
     * 12 个格子排下来会溢出屏幕边界。
     */
    assert.equal(layout.shortPalaceName('财帛宫'), '财帛');
    assert.equal(layout.shortPalaceName('命宫'), '命宫');
    assert.equal(layout.shortPalaceName(''), '');
    assert.equal(layout.shortPalaceName(null), '');
    /** 十二个宫名的短名都不得超过两个字 */
    for (const name of [
      '命宫', '兄弟宫', '夫妻宫', '子女宫', '财帛宫', '疾厄宫',
      '迁移宫', '仆役宫', '官禄宫', '田宅宫', '福德宫', '父母宫'
    ]) {
      assert.ok(layout.shortPalaceName(name).length <= 2, `${name} 的短名太长`);
    }
  });

  /* ================= 正文分段（ink 不认 \n 的补救） ================= */

  await t.test('正文分段：按换行切，空行丢掉', () => {
    const text = '第一段\n\n第二段\n\n\n第三段';
    const parts = chatStore.splitParagraphs(text);
    assert.equal(parts.length, 3);
    assert.deepEqual(parts.map((p) => p.t), ['第一段', '第二段', '第三段']);
    assert.deepEqual(parts.map((p) => p.i), [0, 1, 2]);
  });

  await t.test('正文分段：每一行都不含换行符', () => {
    /**
     * ⚠️ **这是本轮最关键的一条回归**。
     *
     * 2026-11-13 在 AIUI Studio 的**真实 ink 运行时**里实测：
     * ink 的 `<text>` **不认 `\n`** —— 一段 1400 字的解读被排成一整坨，
     * `【一句话定调】`/`【核心论断】` 全部内联到句子中间。
     *
     * 换行必须**在数据层**变成结构（一段一个 `<text>`），
     * 只要有一行还带着 `\n` 漏进模板，那个段落就会糊成一坨。
     */
    const raw = '【命格总览】\n\n你脾气温和。\n\n【一句话定调】\n\n天同太阴坐命。';
    const parts = chatStore.splitParagraphs(raw);
    for (const p of parts) {
      assert.ok(!p.t.includes('\n'), `段落里还留着换行：${p.t}`);
      assert.ok(!p.t.includes('\r'), `段落里还留着回车：${p.t}`);
    }
  });

  await t.test('段落分类：小标题 / 列表项 / 正文段', () => {
    assert.equal(chatStore.paragraphClass('【命格总览】'), 'turn-h');
    assert.equal(chatStore.paragraphClass('【一句话定调】'), 'turn-h');
    assert.equal(chatStore.paragraphClass('【四化路径分析 · 落到你这盘】'), 'turn-h');
    assert.equal(chatStore.paragraphClass('关键推导（倪师断法引擎 · 可回溯引文略）：'), 'turn-h');
    assert.equal(chatStore.paragraphClass('· （引文略）贪狼化权：化权=官印'), 'turn-li');
    assert.equal(chatStore.paragraphClass('你脾气温和，不爱跟人争。'), 'turn-p');
  });

  await t.test('段落分类：只有「整段都是标签」才算小标题', () => {
    /**
     * 列表项里就有 `【火星(急躁·突发)】遇紫微→解厄制化` 这种。
     * 如果按「以【开头」判，它会被误当成标题 ⇒ 整段的层级全乱。
     */
    assert.equal(chatStore.paragraphClass('【火星(急躁·突发)】遇紫微→解厄制化'), 'turn-p');
    assert.equal(chatStore.paragraphClass('「紫微+左辅」 — 吉星辅佐'), 'turn-p');
  });

  await t.test('渲染行：最新一轮在最上面，标注行在正文之前', () => {
    /**
     * ⚠️ 为什么必须最新在最上：
     * 480×352 的滚动区只有 256px（≈13 行），一段解读有 30 行上下。
     * 按时间正序的话，用户提完问题、答案落在**最底下**，
     * 屏幕上看过去是旧内容，等待的那十几秒里屏幕**一动不动**。
     */
    const t1 = chatStore.createTurn({ question: '第一问' });
    const t2 = chatStore.createTurn({ question: '第二问' });
    const done1 = { ...t1, pending: false, answer: '答一' };
    const done2 = { ...t2, pending: false, answer: '答二' };
    const rows = chatStore.viewRows([done1, done2]);
    const texts = rows.map((r) => r.text);
    assert.ok(texts.indexOf('第二问') < texts.indexOf('第一问'), '最新一轮必须排在前面');
    assert.ok(texts[0].startsWith('最新'), `第一行应带「最新」标记，实际：${texts[0]}`);
    /** 标注行必须在问题之前（引文模式要尽早披露） */
    const tagIdx = rows.findIndex((r) => r.cls.startsWith('turn-tag'));
    const qIdx = rows.findIndex((r) => r.cls === 'turn-q');
    assert.ok(tagIdx < qIdx, '标注行必须排在问题之前');
  });

  await t.test('渲染行：等待中 / 失败态各有各的样式', () => {
    const pending = chatStore.createTurn({ question: '问' });
    const rows = chatStore.viewRows([pending]);
    const body = rows.find((r) => r.id.endsWith('-body'));
    assert.ok(body, '等待中也要有一行正文位');
    assert.equal(body.text, '正在推演……');
    assert.ok(body.cls.includes('loading'));

    const failed = { ...pending, pending: false, failed: true, answer: '这一问暂时没有回答。' };
    const rows2 = chatStore.viewRows([failed]);
    const body2 = rows2.find((r) => r.id.endsWith('-body'));
    assert.equal(body2.text, '这一问暂时没有回答。');
    assert.ok(body2.cls.includes('failed'));
  });

  await t.test('渲染行：id 唯一（ink:for 的 key 不能重复）', () => {
    const t1 = chatStore.createTurn({ question: '问一' });
    const t2 = chatStore.createTurn({ question: '问二' });
    const rows = chatStore.viewRows([
      { ...t1, pending: false, answer: '答一\n\n第二段' },
      { ...t2, pending: false, answer: '答二' }
    ]);
    const ids = rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `id 重复了：${ids.join(',')}`);
  });

  await t.test('渲染行：视图模型形状也能算（预览脚本复用同一份逻辑）', () => {
    /**
     * 预览视频脚本拿到的就是**视图模型**（q/a），
     * 它必须能用**同一份**分段逻辑 —— 各写一份必然漂移。
     */
    const turn = chatStore.createTurn({ question: '命宫，今年怎么样？' });
    const views = chatStore.viewTurns([{ ...turn, pending: false, answer: '【总览】\n\n正文一段。' }]);
    const rows = chatStore.viewRows(views);
    assert.ok(rows.some((r) => r.cls === 'turn-h' && r.text === '【总览】'));
    assert.ok(rows.some((r) => r.cls === 'turn-p' && r.text === '正文一段。'));
  });
};
