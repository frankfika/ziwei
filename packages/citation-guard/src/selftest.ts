/**
 * citation-guard 自测。用真实数据集文本跑，不只是人造样例。
 *
 * 运行: npx tsx packages/citation-guard/src/selftest.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  findCitations,
  countCitations,
  hasCitations,
  redactCitations,
  redactByParagraph,
} from './index';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}`);
    console.log(`     ${(e as Error).message.split('\n').slice(0, 6).join('\n     ')}`);
  }
}

console.log('citation-guard 自测\n');

check('纯自造断语不含引文', () => {
  const t = '你是天生的守护者。你稳重踏实，凡事先看稳不稳。';
  assert.equal(hasCitations(t), false);
  assert.equal(countCitations(t), 0);
  assert.equal(redactCitations(t), t);
});

check('显式《天纪》被检出', () => {
  const t = '天府管钱财（倪海厦《天纪》第5集53:06）又说「这个天府星一定要逢到三台八座」。';
  const hits = findCitations(t);
  assert.ok(hits.length > 0, '应当有命中');
  assert.ok(hits.some((h) => h.kind === 'tianji-explicit'));
});

check('p07 00:50:17 定位符被检出', () => {
  const t = '〔禄马交驰〕会进很大的财 ——《天纪》p07 00:50:17';
  const hits = findCitations(t);
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => h.kind === 'tianji-locator' || h.kind === 'tianji-explicit'));
});

check('〔倪师断法·格局〕整块标注被检出', () => {
  const t = '· 〔倪师断法·格局〕【禄马交驰】会进很大的财';
  const hits = findCitations(t);
  assert.ok(hits.some((h) => h.kind === 'bracket-rule'));
});

check('inline 降级保留正文、替换引文', () => {
  const t = '前文正常内容。倪师说「我们简单讲就是后天」（倪海厦《天纪》第9集12:22）。后文正常内容。';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('前文正常内容'), '应保留前文');
  assert.ok(out.includes('后文正常内容'), '应保留后文');
  assert.ok(out.includes('引文略'), '应出现占位符');
  assert.ok(!out.includes('我们简单讲就是后天'), '引文原文应被移除');
});

check('drop-line 丢掉「整行都是引文」的纯引文行', () => {
  const t = [
    '正常的一行。',
    '（倪海厦《天纪》第9集12:22）',
    '· 〔倪师断法·格局〕【禄马交驰】会进很大的财 ——《天纪》p07 00:50:17',
    '另一行正常。',
  ].join('\n');
  const out = redactCitations(t, 'drop-line');
  assert.ok(out.includes('正常的一行'), '普通行应保留');
  assert.ok(out.includes('另一行正常'), '普通行应保留');
  assert.ok(!out.includes('第9集12:22'), '纯引文行应被丢掉');
  // 断法正文（数据集自有 CC BY 内容）应保留，只掉引文标记
  assert.ok(out.includes('禄马交驰'), '断法正文应保留');
  assert.ok(!out.includes('p07 00:50:17'), '引文定位符应被去掉');
});

check('redactByParagraph 不误伤无引文段落', () => {
  const t = '第一段没有引文。\n\n第二段有引文（倪海厦《天纪》p05 00:49:01）。';
  const out = redactByParagraph(t, 'inline');
  assert.ok(out.includes('第一段没有引文。'));
  assert.ok(!out.includes('p05 00:49:01'));
});

// —— 真实数据验证 ——
console.log('\n真实数据集验证:');
const dataDir =
  process.env.ZIWEI_DATA_DIR ?? path.resolve(process.cwd(), 'data');
const raw = path.join(dataDir, 'raw', 'year-1990.jsonl');

if (!fs.existsSync(raw)) {
  console.log('  ⏭  跳过（未找到 data/raw/year-1990.jsonl）');
} else {
  // 流式读前 200 行（文件 740MB，不能整读）
  const rl = readline.createInterface({
    input: fs.createReadStream(raw, { encoding: 'utf8', highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });
  let totalHits = 0;
  let totalChars = 0;
  let withAny = 0;
  let dimCount = 0;
  let firstDimText = '';
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (n >= 200) break;
    n += 1;
    const rec = JSON.parse(line);
    for (const txt of Object.values(rec.c) as string[]) {
      totalHits += countCitations(txt);
      totalChars += txt.length;
      if (hasCitations(txt)) withAny += 1;
      dimCount += 1;
      if (!firstDimText) firstDimText = txt;
    }
  }
  rl.close();

  console.log(`  前 200 盘：引文命中 ${totalHits} 处 / 文本 ${totalChars.toLocaleString()} 字`);
  console.log(`  含引文的维度文本：${withAny} / ${dimCount} 段`);
  const redacted = redactCitations(firstDimText, 'inline');
  console.log(`  降级后（inline）示例：`);
  console.log(`    ${redacted.slice(0, 120).replace(/\n/g, ' ')}...`);

  check('真实数据能被降级且不崩', () => {
    assert.ok(totalHits > 0, '真实数据应含引文');
    assert.ok(redacted.length > 0);
    assert.ok(redacted.length < firstDimText.length);
  });

  check('降级后不再含《天纪》标记', () => {
    assert.ok(!redacted.includes('《天纪》'), '降级文本不应再含《天纪》');
  });
}

console.log(`\n${failed === 0 ? '✅ 全部通过' : '❌ 有失败'}：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
