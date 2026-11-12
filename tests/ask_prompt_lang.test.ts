/**
 * 英文回答链路（answerLang）回归。
 *
 * 钉死三条性质：
 *  1. 默认（不传 / 'zh'）时 prompt 与改造前逐字节一致 —— 中文站行为零变化；
 *  2. 'en' 时 system 换上英文语言行、原中文语言行消失；
 *  3. 'en' 时【回答要求】追加英文作答 + 原文附翻译条款。
 */

import assert from 'node:assert/strict';

import { ASK_SYSTEM_PROMPT, buildAskPrompt, systemPromptFor } from '@ziwei/ask';

import type { Tester } from './harness';

const BIRTH = { year: 1990, month: 5, day: 12, hour: 3, gender: 'female' as const };
const DIMENSIONS = [
  { key: 'overview', label: '命格总览', text: '紫微居午，左右拱照，格局清正。' },
  { key: 'love', label: '感情', text: '夫妻宫廉贞天府，感情宜晚不宜早。' },
];
const BASE = {
  birth: BIRTH,
  question: '这份命盘在职业方向上有什么特点？',
  chartSummary: '紫微在午，命宫在子。',
  dimensions: DIMENSIONS,
};

const ZH_LANG_LINE = '全程简体中文大白话';
const EN_LANG_LINE = 'Answer entirely in natural, colloquial English';
const EN_REQUIREMENT_LINE = 'The user asks in English';

export const suite = async (t: Tester): Promise<void> => {
  await t.test('默认/显式 zh：system 与常量逐字节一致', () => {
    assert.equal(systemPromptFor('zh'), ASK_SYSTEM_PROMPT);
    const def = buildAskPrompt(BASE);
    const zh = buildAskPrompt({ ...BASE, answerLang: 'zh' });
    assert.equal(def.system, ASK_SYSTEM_PROMPT, '默认 answerLang 应等于 zh');
    assert.equal(zh.system, ASK_SYSTEM_PROMPT, '显式 zh 应等于常量');
    assert.deepEqual(zh, def, '显式 zh 与默认输出应逐字节一致');
    assert.ok(!def.user.includes(EN_REQUIREMENT_LINE), 'zh 不应出现英文回答条款');
  });

  await t.test('en：system 换英文语言行，中文语言行消失', () => {
    const en = buildAskPrompt({ ...BASE, answerLang: 'en' });
    assert.ok(en.system.includes(EN_LANG_LINE), 'en system 应含英文语言行');
    assert.ok(!en.system.includes(ZH_LANG_LINE), 'en system 不应残留中文语言行');
  });

  await t.test('en：回答要求追加英文作答 + 原文附翻译条款', () => {
    const en = buildAskPrompt({ ...BASE, answerLang: 'en' });
    const line = en.user
      .split('\n')
      .find((l) => l.includes(EN_REQUIREMENT_LINE));
    assert.ok(line, 'en user 应含英文回答条款');
    assert.match(line!, /translation/i, '条款应要求原文附英文翻译');
  });

  await t.test('en/zh 除 system 与回答要求外其余部分一致（检索不受影响）', () => {
    const zh = buildAskPrompt(BASE);
    const en = buildAskPrompt({ ...BASE, answerLang: 'en' });
    assert.deepEqual(en.selected, zh.selected, '注入维度清单应一致');
    // 英文条款追加在 user 末尾：主体应与 zh 逐字节相同
    assert.ok(en.user.startsWith(zh.user), 'en user 主体（回答要求追加前）应一致');
    assert.equal(
      en.user.slice(zh.user.length),
      `\n- ${EN_REQUIREMENT_LINE}: answer entirely in natural English. When quoting the original Chinese text, give the English translation right after the quote.`,
      'en user 尾部应只有追加的英文条款',
    );
  });
};
