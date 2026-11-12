/**
 * 眼镜端**纯文本化**回归 —— 挂进回归套件。
 *
 * ── 这套测试守的是什么 ───────────────────────────────────────────
 * 后端返回的解读正文 / 追问回答是**带 Markdown 的富文本**，
 * 而 Rokid 眼镜是**单色绿屏**（480×352，#40FF5E 四档亮度，不支持彩色）。
 * 于是那些 Markdown 标记在屏上全是噪声：
 *
 *   - `**【福德总览】**` —— 一串星号；
 *   - `## ✦ 双星同宫` —— 井号 + 装饰符号；
 *   - 🟢🔵🔴🟡 —— 单色屏上要么是方块，要么是空白。
 *
 * 2026-11-13 渲染提审预览视频时**实测**：一段 2498 字的解读正文里有
 * 46 处 `**`、9 个 emoji，画面上就是一坨 `🔵 **贪狼化权**（落福德·你夫妻的三合）`。
 *
 * `lib/plain-text.js` 的职责就是把这些**标记**洗掉 ——
 * 但**一个字的内容都不能少**（项目硬规则：解读正文必须来自数据集原文）。
 *
 * ── 特别要盯住的两条 ─────────────────────────────────────────────
 *  ① **未闭合的 `*` 不能吃掉正文**：原文里有 `*财星配先锋，…` 这种孤星，
 *     不限长的正则会一路吃到下一个 `*`，把中间整段内容抹掉。
 *  ② **★ 校勘说明要留着**：`★校勘 2026-09-05：…` 是引文出处核对信息，
 *     属于内容，不属于装饰。
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Tester } from './harness';
import { type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PLAIN_TEXT = path.join(REPO_ROOT, 'apps/rokid-agent/lib/plain-text.js');

type PlainText = typeof import('../apps/rokid-agent/lib/plain-text.js');

const plain = (await import(PLAIN_TEXT)) as PlainText;

/** 后端真实返回的一段解读正文（2026-11-13 实测采样，已脱去长引用） */
const REAL_READING = [
  '**【福德总览】**',
  '',
  '你心里的事比外人看到的复杂得多。白天你在人前利落、说一不二，夜里安静下来，却容易冒出一句「我得到了什么」。',
  '',
  '**【一句话定调】**',
  '',
  '有福、日子过得舒服；加上擎羊、陀罗、铃星、地空、地劫，《全书》说「福薄」。',
  '',
  '## ✦ 双星同宫 · 「武曲破军」（巳/亥）',
  '',
  '*财星配先锋，先稳后动。*',
  '',
  '**【四化路径分析 · 落到你这盘】**',
  '',
  '🟢 **武曲化禄**（落夫妻·你精神福德本宫）',
  '   化禄，欲望化为掌控力。',
  '',
  '🔵 **贪狼化权**（落福德·你夫妻的三合）',
  '   化权，社交与才艺成为核心竞争力。',
  '',
  '> 紫微斗数讲究阴阳互见，下方为基础。',
  '',
  '---',
  '',
  '### ⚠ 「武曲+地空」 — 煞星冲击',
  '',
  '武曲与地空，主财库易空。',
  '',
  '**【⚠️ 风险提醒】**',
  '',
  '（★校勘 2026-09-05：原引〔天府守命，主人聪明清秀〕系意引。）'
].join('\n');

export const suite: SuiteFn = async (t) => {
  /* ================= 标记清洗 ================= */

  await t.test('`**粗体**` 只删星号，不删文字', () => {
    assert.equal(plain.toPlainText('**【福德总览】**'), '【福德总览】');
    assert.equal(plain.toPlainText('化禄，欲望化为掌控力。'), '化禄，欲望化为掌控力。');
  });

  await t.test('标题井号 / 引用符号 / 列表符号都只删标记', () => {
    assert.equal(plain.toPlainText('## 双星同宫'), '双星同宫');
    assert.equal(plain.toPlainText('### 「武曲+地空」 — 煞星冲击'), '「武曲+地空」 — 煞星冲击');
    assert.equal(plain.toPlainText('> 阴阳互见，下方为基础。'), '阴阳互见，下方为基础。');
    assert.equal(plain.toPlainText('- 第一条\n- 第二条'), '第一条\n第二条');
  });

  await t.test('装饰符号与彩色 emoji 全部去掉', () => {
    assert.equal(plain.toPlainText('✦ 右弼：配偶温柔体贴'), '右弼：配偶温柔体贴');
    assert.equal(plain.toPlainText('⚙ 主辅煞组合精细论断'), '主辅煞组合精细论断');
    assert.equal(plain.toPlainText('🔵 贪狼化权'), '贪狼化权');
    assert.equal(plain.toPlainText('🟢 武曲化禄'), '武曲化禄');
    assert.equal(plain.toPlainText('**【⚠️ 风险提醒】**'), '【风险提醒】');
  });

  await t.test('水平分隔线整行去掉（不留空行堆）', () => {
    const out = plain.toPlainText('上段\n\n---\n\n下段');
    assert.ok(!out.includes('---'));
    assert.ok(out.includes('上段'));
    assert.ok(out.includes('下段'));
  });

  /* ================= 内容不许丢 ================= */

  await t.test('★ 校勘说明要留着（它是内容，不是装饰）', () => {
    const out = plain.toPlainText('（★校勘 2026-09-05：原引系意引。）');
    assert.ok(out.includes('★校勘 2026-09-05'), `校勘说明被误删了：${out}`);
  });

  await t.test('未闭合的孤星不能吃掉正文', () => {
    /**
     * 回归风险：`*财星配先锋，先稳后动。*` 之后如果还有别的 `*`，
     * 不限长的斜体正则会一路吃到下一个 `*`，把中间整段抹掉。
     */
    const src = '*财星配先锋，先稳后动。\n\n后面这一段绝对不能被吃掉。\n\n另一个*星号。';
    const out = plain.toPlainText(src);
    assert.ok(out.includes('财星配先锋'), out);
    assert.ok(out.includes('后面这一段绝对不能被吃掉'), out);
    assert.ok(out.includes('另一个'), out);
  });

  await t.test('清洗后**一个字都不能少**（真实正文逐句核对）', () => {
    const out = plain.toPlainText(REAL_READING);
    const mustKeep = [
      '【福德总览】',
      '你心里的事比外人看到的复杂得多。',
      '【一句话定调】',
      '双星同宫',
      '财星配先锋',
      '【四化路径分析 · 落到你这盘】',
      '武曲化禄',
      '贪狼化权',
      '欲望化为掌控力',
      '阴阳互见，下方为基础。',
      '「武曲+地空」 — 煞星冲击',
      '武曲与地空，主财库易空。',
      '【风险提醒】',
      '★校勘 2026-09-05'
    ];
    for (const frag of mustKeep) {
      assert.ok(out.includes(frag), `清洗后丢了这一段：${frag}\n----\n${out}`);
    }
  });

  await t.test('清洗后不再有任何 Markdown 标记残留', () => {
    const out = plain.toPlainText(REAL_READING);
    assert.ok(!/\*\*/.test(out), `还有 ** 残留：${out.slice(0, 200)}`);
    assert.ok(!/^#{1,6}\s/m.test(out), '还有标题井号残留');
    assert.ok(!/^>\s/m.test(out), '还有引用符号残留');
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(out), '还有彩色 emoji 残留');
    assert.ok(!/[✦▸▍⚙⚠]/u.test(out), '还有装饰符号残留');
  });

  await t.test('段落结构保留（单色屏靠空行分段）', () => {
    const out = plain.toPlainText(REAL_READING);
    assert.ok(out.includes('\n\n'), '段落之间的空行没了');
    assert.ok(!/\n{3,}/.test(out), '空行堆成一片了');
  });

  /* ================= 边界 ================= */

  await t.test('空输入 / 非字符串不炸', () => {
    assert.equal(plain.toPlainText(''), '');
    assert.equal(plain.toPlainText(null), '');
    assert.equal(plain.toPlainText(undefined), '');
    assert.equal(plain.toPlainText(123), '123');
    assert.equal(plain.toPlainText('   \n\n  '), '');
  });

  await t.test('纯文本原样返回（不该被改）', () => {
    const src = '你是天生的守护者。你稳重踏实，凡事先看稳不稳。';
    assert.equal(plain.toPlainText(src), src);
  });

  /* ================= 首句摘要 ================= */

  await t.test('firstSentence 取第一句并限长', () => {
    assert.equal(
      plain.firstSentence('你是天生的守护者。你稳重踏实，凡事先看稳不稳。'),
      '你是天生的守护者'
    );
    /**
     * 句末的句号不带走 —— 摘要塞进中宫时不需要标点收尾，
     * 与 chat-store 的 `summarize` 口径一致。
     */
    assert.equal(plain.firstSentence('**你是天生的守护者。**后面还有。'), '你是天生的守护者');
    assert.equal(plain.firstSentence(''), '');
  });

  await t.test('firstSentence 超长时截断加省略号', () => {
    const long = '一'.repeat(100);
    const out = plain.firstSentence(long, 10);
    assert.equal(out.length, 10);
    assert.ok(out.endsWith('…'));
  });
};
