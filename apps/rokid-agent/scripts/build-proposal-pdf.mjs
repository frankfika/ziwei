#!/usr/bin/env node
/**
 * 生成报名用「作品策划案」PDF。
 *
 * 为什么要脱敏：`PROPOSAL.md` §9.3 里写着完整的禁用词表。那份词表本身不能出现在
 * 提交给 Rokid 审核方的文件里 —— 上报材料里逐条列出「转运 / 算命 / 占卜 …」，
 * 等于自己把红线词摆在审核面前。`<!-- proposal-pdf:redact -->` 块在生成 PDF 时
 * 被替换成一段合规说明（内容不变，只是不复述词表）。
 *
 * 流程：PROPOSAL.md →（脱敏 + 去掉重复标题块）→ pandoc → HTML 片段
 *       → 自建 HTML 模板（封面 + 目录 + 页脚）→ playwright(chromium) → PDF(A4)
 *
 * 用法：
 *   node apps/rokid-agent/scripts/build-proposal-pdf.mjs
 *   node apps/rokid-agent/scripts/build-proposal-pdf.mjs --out <path>
 *
 * 退出码：0 = 生成成功；1 = 失败（合规门禁不通过 / 工具缺失 / 超过 30MB 上限）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';
import { AGENT_ROOT, loadTerms, scanFiles } from './forbidden-terms.mjs';

const REDACT_OPEN = '<!-- proposal-pdf:redact -->';
const REDACT_CLOSE = '<!-- /proposal-pdf:redact -->';

/**
 * 脱敏后的占位说明 —— 自身也必须零红线词（第一版这里写了「准确率/命中率/算命」，
 * 结果脱敏文案自己把红线词又带回了 PDF）。所以这里只描述**类别**，不复述具体词。
 */
const REDACT_TEXT = [
  '**绝对不能出现的词**：',
  '',
  '> 本作品遵循一套完整的用词红线 —— 不使用任何宣扬预测、承诺结果或渲染术数迷信的表述，',
  '> 也不给出任何形式的量化承诺（百分比、比例、评分、命中情况）。完整禁用词表保存在',
  '> 团队内部合规文档中，不随本策划案公开，避免在审核材料里复述红线词本身。',
  '',
  '**替换口径**（示例）：',
  '',
  '| 不要写 | 改写成 |',
  '|---|---|',
  '| 对结果的运势式描述 | 呈现传统解读文本 |',
  '| 任何百分比式的承诺 | 规则可复算，同一生辰必得同一张盘 |',
  '| 对结果好坏下判断 | 盘面结构（主星、四化、五行局） |',
  '| 命盘 | 盘面 / 十二宫盘 |',
  '| 运势／运程 | 传统解读文本 |',
  '| 把术数说成预测的表述 | 紫微斗数（传统术数）盘面推演 |',
].join('\n');

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Songti SC", serif;
  font-size: 10.5pt; line-height: 1.72; color: #1a1a1a; margin: 0;
}
h1 { font-size: 17pt; margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 2.2pt solid #1a1a1a; page-break-after: avoid; }
h2 { font-size: 14pt; margin: 9mm 0 3mm; padding-left: 3mm; border-left: 3.6pt solid #1a1a1a; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 4mm 0 1.5mm; page-break-after: avoid; }
p { margin: 0 0 2.6mm; text-align: justify; }
ul, ol { margin: 0 0 2.6mm; padding-left: 7mm; }
li { margin-bottom: 1.2mm; }
strong { font-weight: 600; }
a { color: #1a1a1a; text-decoration: none; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 8.8pt; background: #f2f3f5; padding: 0.4mm 1.2mm; border-radius: 1mm; }
pre {
  background: #f6f7f8; border-left: 2.6pt solid #c8ccd0; padding: 3mm 3.5mm;
  border-radius: 0 1mm 1mm 0; font-size: 8.6pt; line-height: 1.5;
  white-space: pre-wrap; word-break: break-all; page-break-inside: avoid;
}
pre code { background: none; padding: 0; font-size: 8.6pt; }
table { border-collapse: collapse; width: 100%; margin: 2.5mm 0 4mm; font-size: 9.4pt; line-height: 1.55; page-break-inside: avoid; }
th, td { border: 0.6pt solid #b8bcc0; padding: 1.6mm 2.2mm; vertical-align: top; }
th { background: #eef0f2; font-weight: 600; }
blockquote { margin: 2.5mm 0; padding: 2mm 4mm; border-left: 2.6pt solid #9aa0a6; background: #f7f8f9; color: #333; }
blockquote p { margin-bottom: 1.2mm; }
hr { border: none; border-top: 0.6pt solid #c8ccd0; margin: 6mm 0; }

nav#TOC { page-break-after: always; font-size: 10pt; }
nav#TOC > h2 { border-left: none; padding-left: 0; margin-top: 0; }
nav#TOC ul { list-style: none; padding-left: 0; }
nav#TOC li { margin: 0 0 1.6mm; }
nav#TOC a { border-bottom: 0.5pt dotted #999; }

.cover { page-break-after: always; padding-top: 46mm; }
.cover-kicker { font-size: 10.5pt; letter-spacing: 0.6pt; color: #555; margin-bottom: 12mm; }
.cover-title { font-size: 34pt; font-weight: 700; margin: 0 0 3mm; padding: 0; border: none; letter-spacing: 3pt; }
.cover-sub { font-size: 15pt; color: #333; margin-bottom: 8mm; letter-spacing: 2pt; }
.cover-rule { height: 2.6pt; background: #1a1a1a; width: 46mm; margin-bottom: 12mm; }
.cover-meta { width: 100%; font-size: 10pt; margin-bottom: 10mm; }
.cover-meta td { border: none; border-bottom: 0.5pt solid #d4d7da; padding: 2.4mm 0; }
.cover-meta td:first-child { width: 34mm; color: #555; }
.cover-note { font-size: 8.8pt; color: #777; line-height: 1.65; border-top: 0.5pt solid #d4d7da; padding-top: 4mm; }
`;

function redact(text) {
  const start = text.indexOf(REDACT_OPEN);
  const end = text.indexOf(REDACT_CLOSE);
  if (start < 0 || end < 0) {
    console.warn('⚠ 没找到 redact 标记块，PDF 将原样包含 §9.3 词表 —— 请检查 PROPOSAL.md。');
    return text;
  }
  return `${text.slice(0, start)}\n${REDACT_TEXT}\n${text.slice(end + REDACT_CLOSE.length)}`;
}

/** 去掉正文开头的 H1 与元信息 blockquote —— 它们已由封面承载。 */
function stripLeadBlock(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && lines[i].startsWith('# ')) i++;
  while (i < lines.length && !lines[i].trim()) i++;
  while (i < lines.length && lines[i].startsWith('>')) i++;
  while (i < lines.length && (!lines[i].trim() || lines[i].trim() === '---')) i++;
  return lines.slice(i).join('\n');
}

const COVER = `
<div class="cover">
  <div class="cover-kicker">Rokid Spatial Joy 2026 · 全球开发大赛 · Rokid AI 赛道</div>
  <h1 class="cover-title">紫微星盘</h1>
  <div class="cover-sub">作品策划案</div>
  <div class="cover-rule"></div>
  <table class="cover-meta">
    <tr><td>参赛作品</td><td>Rokid Spatial Joy 2026 全球开发大赛 · AI 赛道（AIUI 智能体）</td></tr>
    <tr><td>作品形态</td><td>运行在 Rokid AI Glasses 上的 AIUI 智能体</td></tr>
    <tr><td>申请人</td><td>陈放 Frank / 紫微助手（ziwei-assistant）</td></tr>
    <tr><td>申报日期</td><td>2026-11-06</td></tr>
    <tr><td>报名与作品提交截止</td><td>2027-01-28</td></tr>
  </table>
  <div class="cover-note">本策划案正文含一份完整的用词红线说明。为避免在审核材料中复述红线词本身，该部分以占位说明呈现，内容与团队内部合规文档一致。</div>
</div>
`;

/** 自定义 pandoc 模板：封面（include-before-body）+ 目录 + 正文。 */
const TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title$</title>
<style>
/*__CSS__*/
</style>
</head>
<body>
<!--__COVER__-->
$if(toc)$
<nav id="TOC" role="doc-toc">
<h2>目录</h2>
$table-of-contents$
</nav>
$endif$
$body$
</body>
</html>
`;

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(join(root, 'noop.js'))(name);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outPath =
    outIdx > -1 && process.argv[outIdx + 1]
      ? process.argv[outIdx + 1]
      : join(AGENT_ROOT, 'submit-kit', 'proposal', '紫微星盘-作品策划案.pdf');

  // ① 合规门禁：TIER1 硬禁用命中就拒绝对外产出。
  const terms = loadTerms();
  const scan = scanFiles([join(AGENT_ROOT, 'PROPOSAL.md')], terms);
  if (scan.violations.length) {
    console.error('✗ 合规门禁未通过，拒绝生成对外 PDF：');
    for (const v of scan.violations) console.error(`  ${v.file}:${v.line} [${v.term}] ${v.text}`);
    process.exit(1);
  }

  // ② 脱敏 + 去重复标题块
  const raw = readFileSync(join(AGENT_ROOT, 'PROPOSAL.md'), 'utf8');
  const cleaned = stripLeadBlock(redact(raw));

  // ②b 脱敏后的正文自检 —— 脱敏文案本身也可能带进红线词（第一版就写了「准确率/命中率/算命」，
  //     结果占位说明把红线词又带回了 PDF）。这里必须硬失败，不能只靠人眼。
  const leaked = terms.hard.filter((t) => cleaned.includes(t));
  if (leaked.length) {
    console.error('✗ 脱敏后的正文仍含红线词，拒绝生成对外 PDF：');
    for (const t of leaked) {
      const at = cleaned.indexOf(t);
      console.error(`  [${t}]  …${cleaned.slice(Math.max(0, at - 50), at + 50).replace(/\n/g, ' ')}…`);
    }
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });

  const work = join(tmpdir(), `ziwei-proposal-${process.pid}`);
  mkdirSync(work, { recursive: true });
  try {
    const mdPath = join(work, 'proposal.md');
    const htmlPath = join(work, 'proposal.html');
    const tplPath = join(work, 'template.html');
    writeFileSync(mdPath, cleaned, 'utf8');
    writeFileSync(tplPath, TEMPLATE.replace('/*__CSS__*/', CSS).replace('<!--__COVER__-->', COVER), 'utf8');

    // ③ pandoc → HTML（自定义模板 + 封面 + 目录）
    run('pandoc', [
      mdPath,
      '-f', 'gfm',
      '-t', 'html5',
      '--standalone',
      '--template', tplPath,
      '--toc', '--toc-depth=2',
      '--metadata', 'title=紫微星盘 · 作品策划案',
      '-o', htmlPath,
    ]);

    // ⑤ chromium → PDF
    const { chromium } = requireGlobal('playwright');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
      await page.pdf({
        path: outPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:7.6pt;color:#888;padding:0 16mm;display:flex;justify-content:space-between;font-family:\'PingFang SC\',sans-serif;">' +
          '<span>紫微星盘 · Rokid Spatial Joy 2026 作品策划案</span>' +
          '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      });
    } finally {
      await browser.close();
    }

    const size = statSync(outPath).size;
    console.log(`✓ 策划案 PDF 已生成：${outPath}`);
    console.log(`  大小 ${(size / 1024 / 1024).toFixed(2)} MB（报名上限 30 MB）｜文件名「${basename(outPath)}」（上限 50 字符）`);
    if (size > 30 * 1024 * 1024) {
      console.error('✗ 超过 30MB 上限，报名会被拒。');
      process.exit(1);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('✗ 生成失败：', err.message);
  process.exit(1);
});
