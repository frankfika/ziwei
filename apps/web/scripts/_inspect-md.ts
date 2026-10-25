// 临时勘察脚本：统计数据集 Markdown 里出现的构造。用完即删。
import { ReadingIndex } from '@ziwei/reading-index';

const idx = new ReadingIndex();
const keys = [
  '1990-06-15-6-female',
  '2000-03-03-9-male',
  '2020-12-31-11-female',
  '1990-01-01-0-male',
  '2000-02-29-3-female',
];

const lineStarts = new Map<string, number>();
const inlineChars = new Map<string, number>();
const maxLen = { dim: '', n: 0 };

for (const k of keys) {
  const r = idx.getByKey(k);
  if (!r.found) {
    console.log('MISS', k);
    continue;
  }
  for (const [dk, v] of Object.entries(r.record.c as Record<string, string>)) {
    if (v.length > maxLen.n) {
      maxLen.n = v.length;
      maxLen.dim = dk;
    }
    for (const raw of v.split('\n')) {
      const t = raw.trim();
      if (!t) continue;
      const head = t.slice(0, 1);
      const key = /^[*-]/.test(t) ? `bullet(${head})` : /^[#>]/.test(t) ? 'heading' : /^\d+[.、)]/.test(t) ? 'ordered' : /^\|/.test(t) ? 'table' : 'plain';
      lineStarts.set(key, (lineStarts.get(key) ?? 0) + 1);
      for (const ch of t) {
        if ('*_`~[]()#>|'.includes(ch)) {
          inlineChars.set(ch, (inlineChars.get(ch) ?? 0) + 1);
        }
      }
    }
  }
}

console.log('line kinds:', JSON.stringify(Object.fromEntries(lineStarts)));
console.log('inline chars:', JSON.stringify(Object.fromEntries(inlineChars)));
console.log('longest dim:', maxLen.dim, maxLen.n);

// 抽样看 bullet 具体形态
const r = idx.getByKey('1990-06-15-6-female');
if (r.found) {
  const text = (r.record.c as Record<string, string>).overview ?? '';
  console.log('--- sample bullet lines ---');
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (/^[*-]/.test(t) || /^\d+[.、)]/.test(t)) console.log(JSON.stringify(t.slice(0, 60)));
  }
}
