/**
 * 话题芯片：全站统一（首页对话壳 + 命盘页悬浮球）。
 * label（中文）作话题建档的稳定键，切语言不串库。
 */
import type { AskQuickPrompt } from '@/components/AskPanel';

export const INTENT_CHIPS: AskQuickPrompt[] = [
  { label: '今年如何', labelEn: 'This year', question: '今年（流年）整体如何？流年命宫和流年四化带来了什么变化？', time: 'liunian', featured: true, hint: '流年命宫与四化', hintEn: 'Annual palace & transformations' },
  { label: '这十年', labelEn: 'This decade', question: '当前这步大限（十年运限）整体如何？大限命宫和大限四化怎么看？', time: 'daxian', hint: '当前大限的十年走向', hintEn: 'The ten-year cycle ahead' },
  { label: '整体格局', labelEn: 'Overall chart', question: '这份命盘的整体格局是怎样的？原文怎么定性的？', dimension: 'overview', hint: '原局整体定性', hintEn: 'The natal chart’s character' },
  { label: '感情', labelEn: 'Love', question: '我的感情与婚姻，原文是怎么说的？', dimension: 'love', featured: true, hint: '婚姻与相处模式', hintEn: 'Marriage & how you relate' },
  { label: '事业', labelEn: 'Career', question: '事业方向上，这份命盘有什么特点？', dimension: 'career', featured: true, hint: '适合的方向与特点', hintEn: 'Where you do best' },
  { label: '财运', labelEn: 'Money', question: '财运方面，原文给了哪些倾向？', dimension: 'wealth', featured: true, hint: '原文给出的倾向', hintEn: 'How the text reads it' },
  { label: '健康', labelEn: 'Health', question: '健康方面，原文里有没有要留意的地方？', dimension: 'health', hint: '需要留意的部分', hintEn: 'What to watch' },
];
