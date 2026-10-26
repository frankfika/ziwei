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
  matchBrackets,
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

/**
 * 括号配对检查。
 * 数据集里本身存在少数括号不配对的样本，所以这里比较的是
 * 「降级后的问题数」是否比「降级前」更多 —— 降级不得引入新的破损。
 */
function bracketIssues(s: string): number {
  const stack: string[] = [];
  let bad = 0;
  const OPEN: Record<string, string> = {
    '（': '）', '(': ')', '【': '】', '〔': '〕',
    '「': '」', '《': '》', '“': '”', '‘': '’',
  };
  const CLOSE: Record<string, string> = Object.fromEntries(
    Object.entries(OPEN).map(([o, c]) => [c, o]),
  );
  for (const ch of s) {
    if (OPEN[ch]) stack.push(OPEN[ch]);
    else if (CLOSE[ch]) {
      if (!stack.length) bad += 1;
      else if (stack.pop() !== ch) bad += 1;
    }
  }
  return bad + stack.length;
}

console.log('citation-guard 自测\n');

console.log('基本检测:');

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

check('「第N集」是定位符前缀，一并纳入（早期版本漏了它）', () => {
  const t = '（倪海厦《天纪》第5集53:06）';
  const hits = findCitations(t);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].text.includes('第5集'), `应包含「第5集」，实际：${hits[0].text}`);
});

console.log('\n受限 / 自有 的分界:');

check('叙述句里的「倪师说」是数据集自有转述，不算引文', () => {
  const t = '可见天府不是只会看着家底。倪师说天府是文官星，也是教书的星。';
  assert.equal(countCitations(t), 0, '不应被判为引文');
  assert.equal(redactCitations(t, 'inline'), t, '不应被改写');
});

check('「但倪师说法不同」不被抹成「但（引文略）法不同」', () => {
  const t = '但倪师说法不同：《全书》卷二说天府「能解一切灾厄」。';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('倪师说法不同'), `实际：${out}`);
  assert.ok(!out.includes('引文略'));
});

check('「本平台批盘按倪师」不被误绑到前一个定位符', () => {
  const t = '」（第7集27:56）本平台批盘按倪师，单独一颗天府不当挡灾的星用。';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('本平台批盘按倪师'), `实际：${out}`);
});

check('不含《天纪》标记的括号（免责声明）完整保留', () => {
  const t = '传统以土应脾胃（倪师断疾厄先看通盘、按杀星最集中那一宫的地支配脏腑，非按星五行，此仅列传统对应、不作病断）。';
  assert.equal(countCitations(t), 0, '免责声明括号不应判为引文');
  assert.equal(redactCitations(t, 'inline'), t);
});

check('《紫微斗数全书》的自引不算受限内容', () => {
  const t = '《紫微斗数全书·卷一·诸星问答论·天府》：「天府属土，南斗主令第一星也」';
  assert.equal(countCitations(t), 0);
});

console.log('\n降级与括号配对:');

check('inline 降级保留正文、替换引文', () => {
  const t = '前文正常内容。倪师说「我们简单讲就是后天」（倪海厦《天纪》第9集12:22）。后文正常内容。';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('前文正常内容'), '应保留前文');
  assert.ok(out.includes('后文正常内容'), '应保留后文');
  assert.ok(out.includes('引文略'), '应出现占位符');
  assert.ok(!out.includes('我们简单讲就是后天'), '引文原文应被移除');
});

check('出处括号整体降级，不产生嵌套括号', () => {
  const t = '照样发生。」（倪海厦《天纪》第5集53:06）';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('（引文略）'), `实际：${out}`);
  assert.ok(!out.includes('（（'), `不应出现嵌套括号：${out}`);
  assert.ok(!out.includes('））'), `不应出现嵌套括号：${out}`);
  assert.ok(!out.includes('第5集'), '定位符应被移除');
});

check('括号内的局部替换用不带括号的占位符', () => {
  const t = '**关键推导**（倪师断法引擎 · 可回溯《天纪》）：';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('可回溯引文略'), `实际：${out}`);
  assert.ok(!out.includes('（（'), `不应出现嵌套括号：${out}`);
});

check('混合括号只替换受限部分，免责说明保留', () => {
  const t = '心里盘算不少（倪师《天纪》p05 00:49:01、00:52:09；文中古书「忠厚老实」一路宜按 traditional 看待，非倪师定论）';
  const out = redactCitations(t, 'inline');
  assert.ok(out.includes('引文略'), `实际：${out}`);
  assert.ok(out.includes('非倪师定论'), `免责说明应保留：${out}`);
  assert.ok(!out.includes('p05'), '定位符应被移除');
  assert.ok(!out.includes('00:49:01'), '定位符应被移除');
});

check('引号原话与其出处一并降级', () => {
  const t = '倪师说「我们简单讲就是后天」（倪海厦《天纪》第9集12:22）';
  const out = redactCitations(t, 'inline');
  assert.ok(!out.includes('我们简单讲就是后天'), `引文原文应被移除：${out}`);
  assert.ok(!out.includes('倪海厦'), '出处署名应被移除');
});

check('跨行不合并 —— 两条 bullet 行各自的行首符号不被吞', () => {
  const t = '· 〔倪师断法·格局〕【禄马交驰】会进很大的财 ——《天纪》p07 00:50:17\n· 〔倪师断法·应期〕当前大限走【子女宫】';
  const out = redactCitations(t, 'inline');
  const lines = out.split('\n');
  assert.equal(lines.length, 2, `应仍是两行：${out}`);
  assert.ok(lines[0].startsWith('· '), `第一行行首符号应保留：${lines[0]}`);
  assert.ok(lines[1].startsWith('· '), `第二行行首符号应保留：${lines[1]}`);
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

check('matchBrackets 找出配对括号', () => {
  const pairs = matchBrackets('（甲）和（乙）');
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].open, 0);
  assert.equal(pairs[1].close, 6);
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

  // 回归统计
  let bracketRegressions = 0;
  let residualMarkers = 0;
  let lineLosses = 0;
  let niBefore = 0;
  let niAfter = 0;
  let residualSamples: string[] = [];

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

      if (!hasCitations(txt)) continue;
      const out = redactCitations(txt, 'inline');

      // ① 降级不得引入新的括号破损
      if (bracketIssues(out) > bracketIssues(txt)) bracketRegressions += 1;

      // ② 降级后不得残留受限标记
      if (/《天纪》|天纪(?:原话|话|集数)?|\d{1,2}:\d{2}(?::\d{2})?/.test(out)) {
        residualMarkers += 1;
        if (residualSamples.length < 5) {
          const m = out.match(/.{0,40}(《天纪》|天纪(?:原话|话|集数)?|\d{1,2}:\d{2}(?::\d{2})?).{0,25}/);
          residualSamples.push(m ? m[0] : out.slice(0, 90));
        }
      }

      // ③ 不得丢正文行（只允许折叠连续空行）
      const norm = (arr: string[]) => {
        const r: string[] = [];
        for (const l of arr) {
          if (l.trim() === '' && r.length && r[r.length - 1].trim() === '') continue;
          r.push(l);
        }
        return r;
      };
      if (norm(out.trim().split('\n')).length !== norm(txt.trim().split('\n')).length) {
        lineLosses += 1;
      }

      niBefore += (txt.match(/倪师|倪海厦/g) ?? []).length;
      niAfter += (out.match(/倪师|倪海厦/g) ?? []).length;
    }
  }
  rl.close();

  console.log(`  前 200 盘：引文命中 ${totalHits} 处 / 文本 ${totalChars.toLocaleString()} 字`);
  console.log(`  含引文的维度文本：${withAny} / ${dimCount} 段`);
  console.log(`  「倪师/倪海厦」：原文 ${niBefore} 处 → 降级后保留 ${niAfter} 处（移除 ${niBefore - niAfter} 处出处署名）`);
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

  check('降级不得引入新的括号破损（真实数据全量）', () => {
    assert.equal(
      bracketRegressions,
      0,
      `有 ${bracketRegressions} 段文本降级后括号问题变多`,
    );
  });

  check('降级后不残留定位符等受限标记（真实数据全量）', () => {
    assert.equal(
      residualMarkers,
      0,
      `有 ${residualMarkers} 段残留：\n${residualSamples.join('\n')}`,
    );
  });

  check('降级不丢正文行（真实数据全量）', () => {
    assert.equal(lineLosses, 0, `有 ${lineLosses} 段丢了正文行`);
  });

  check('转述类「倪师」表述被保留（真实数据全量）', () => {
    assert.ok(niAfter > 0, '叙述句里的转述应保留');
    assert.ok(
      niAfter < niBefore,
      '与《天纪》绑定的出处署名应被移除',
    );
  });
}

console.log(`\n${failed === 0 ? '✅ 全部通过' : '❌ 有失败'}：${passed} 通过 / ${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
