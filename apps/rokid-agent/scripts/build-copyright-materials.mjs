#!/usr/bin/env node
/**
 * 生成软件著作权登记材料包（两件 PDF + 一份指引）。
 *
 * 为什么单独写这个脚本：
 *   软著登记要求提交**源程序**和**文档**两份打印稿，格式很死：
 *   · 源程序：每页 ≥ 50 行，页眉标注「软件名称 / 版本号 / 页码」，
 *     提交**前 30 页 + 后 30 页**（总页数不足 60 页则全部提交）；
 *   · 文档：用户手册，60 页以内。
 *   这套排版规则跟「作品策划案 PDF」完全不同（那是 pandoc + A4 排版的 Markdown），
 *   所以不能复用 build-proposal-pdf.mjs，只能另起一套：源程序要**精确控制每页行数**，
 *   靠 CSS 的自动分页是控不准的 —— 必须自己切页。
 *
 * 流程：
 *   ① 收集源文件（有序）→ 拼成一份带文件头注释的「源程序合集」
 *   ② 每 50 行切一页；总页数 > 60 时取前 30 + 后 30，中间放一页省略说明
 *   ③ 每页一个固定高度的 <div>，用 CSS `page-break-after: always` 强制分页
 *   ④ chromium → PDF(A4)，页眉（软件名/版本/页码）用每页 div 自绘，
 *      不用 playwright 的 displayHeaderFooter —— 那个模板里塞中文字体不可靠
 *   ⑤ 说明书 md → pandoc → HTML → chromium → PDF
 *
 * 用法：
 *   node apps/rokid-agent/scripts/build-copyright-materials.mjs
 *   node apps/rokid-agent/scripts/build-copyright-materials.mjs --only source
 *   node apps/rokid-agent/scripts/build-copyright-materials.mjs --only manual
 *
 * 退出码：0 = 成功；1 = 失败（合规门禁不过 / 工具缺失 / 源程序不足 60 页）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname, relative } from 'node:path';
import { AGENT_ROOT, loadTerms, scanFiles } from './forbidden-terms.mjs';

const REPO_ROOT = join(AGENT_ROOT, '..', '..');
const OUT_DIR = join(AGENT_ROOT, 'submit-kit', 'copyright');

/** 登记信息 —— 与《软件说明书》封面一致。 */
const SOFTWARE = {
  name: '紫微星盘',
  nameEn: 'Ziwei Star Chart',
  version: 'V1.0',
  owner: '陈放',
  /** 页眉用。软著要求页眉含软件名称与版本号。 */
  header: '紫微星盘 V1.0',
};

/** 每页行数 —— 软著要求每页不少于 50 行。 */
const LINES_PER_PAGE = 50;
/** 前 N 页 + 后 N 页。 */
const HEAD_PAGES = 30;
const TAIL_PAGES = 30;
/**
 * 单行最大显示宽度（全角字符按 2 计）。
 * 正文可用宽度 ≈ 210 − 16×2 − (行号槽 9 + 间距 3.5) ≈ 165.5mm，
 * 8.4pt 等宽 ASCII 字符宽约 1.78mm → 约 93 个 ASCII 字符。
 * 取 88 留一点余量；超出的行**折行**而不是裁掉 —— 裁掉等于交上去的代码是残的。
 */
const MAX_COLS = 88;

/** 显示宽度：全角字符按 2 列计。 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

/** 把超长行拆成多行（每行仍是一个可打印行），续行用两空格缩进标记。 */
function wrapLine(text) {
  if (displayWidth(text) <= MAX_COLS) return [text];
  const out = [];
  let rest = text;
  let first = true;
  while (rest.length) {
    const limit = first ? MAX_COLS : MAX_COLS - 2;
    let cut = 0;
    let w = 0;
    for (const ch of rest) {
      const cw = displayWidth(ch);
      if (w + cw > limit) break;
      w += cw;
      cut += ch.length;
    }
    if (cut === 0) cut = 1;
    const piece = rest.slice(0, cut);
    rest = rest.slice(cut);
    out.push(first ? piece : `  ${piece}`);
    first = false;
  }
  return out;
}

/**
 * 源程序文件清单（**有序**）。
 *
 * 顺序按「核心算法 → 交互层 → 主页面 → 入口」的逻辑排，
 * 这样提交的前 30 页是真正有技术含量的核心代码，而不是配置文件。
 *
 * `assets/engine.js` 是打包产物（862 KB 单行），**不进打印稿** ——
 * 登记提交的是源程序，打包产物属于重复且不可读。
 */
const SOURCE_FILES = [
  'packages/chart-engine/src/types.ts',
  'packages/chart-engine/src/adapter.ts',
  'packages/chart-engine/src/index.ts',
  'packages/rokid-agent/lib/chart-layout.js',
  'packages/rokid-agent/lib/head-cursor.js',
  'packages/rokid-agent/lib/birth-parser.js',
  'packages/rokid-agent/lib/time-layer.js',
  'packages/rokid-agent/lib/api.js',
  'packages/rokid-agent/lib/tts.js',
  'packages/rokid-agent/lib/voice-input.js',
  'packages/rokid-agent/lib/storage.js',
  'packages/rokid-agent/lib/key-guard.js',
  'packages/rokid-agent/lib/chart-source.js',
  'packages/rokid-agent/lib/birth-source.js',
  'packages/rokid-agent/pages/index/index.ink',
  'packages/rokid-agent/app.js',
  'packages/rokid-agent/app.json',
];

/** 仓库里实际路径与上面的逻辑路径不一致时的映射。 */
const PATH_FIX = (p) =>
  p.replace(/^packages\/rokid-agent\//, 'apps/rokid-agent/');

const CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "PingFang SC", "Hiragino Sans GB", "Heiti SC", "Songti SC", serif;
  color: #111;
}

/* ── 源程序打印稿 ─────────────────────────────── */
.page {
  width: 210mm;
  height: 297mm;
  padding: 18mm 16mm 16mm;
  page-break-after: always;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.page:last-child { page-break-after: auto; }

.page-header {
  height: 9mm;
  flex: 0 0 auto;
  border-bottom: 0.8pt solid #222;
  font-size: 9.5pt;
  letter-spacing: 0.4pt;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 1.6mm;
  margin-bottom: 3.5mm;
}
.page-header .ph-title { font-weight: 700; }
.page-header .ph-meta { color: #444; font-size: 9pt; }

.code {
  flex: 0 0 auto;
  height: 235mm;                 /* 50 行 × 4.7mm，硬高度，布局不受内容影响 */
  font-family: "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 8.4pt;
  line-height: 4.7mm;
  overflow: hidden;
}
.code .ln {
  display: block;
  height: 4.7mm;                 /* 每行一个固定行框：超宽的行直接裁掉，绝不折行 */
  line-height: 4.7mm;
  white-space: pre;
  overflow: hidden;
}
.code .ln-no {
  display: inline-block;
  width: 11mm;
  color: #999;
  text-align: right;
  margin-right: 3.5mm;
  user-select: none;
}
.code .fn {
  color: #0b5fa5;
  font-weight: 700;
}
.code .cm { color: #6a6a6a; }
.code .st { color: #a02c2c; }

.page-footer {
  flex: 0 0 auto;
  height: 8mm;
  border-top: 0.5pt solid #999;
  margin-top: 3mm;
  padding-top: 1.6mm;
  font-size: 8.5pt;
  color: #444;
  display: flex;
  justify-content: space-between;
}

/* ── 说明书打印稿 ─────────────────────────────── */
.manual { padding: 20mm 18mm 18mm; }
.manual h1 { font-size: 19pt; margin: 0 0 5mm; padding-bottom: 3mm; border-bottom: 2pt solid #111; }
.manual h2 { font-size: 14pt; margin: 9mm 0 3mm; padding-left: 3mm; border-left: 3.5pt solid #111; }
.manual h3 { font-size: 11.5pt; margin: 6mm 0 2mm; }
.manual h4 { font-size: 10.5pt; margin: 4mm 0 1.5mm; }
.manual p { margin: 0 0 2.6mm; text-align: justify; line-height: 1.75; }
.manual ul, .manual ol { margin: 0 0 2.6mm; padding-left: 7mm; }
.manual li { margin-bottom: 1.2mm; }
.manual code { font-family: "SF Mono", Menlo, monospace; font-size: 8.8pt; background: #f2f3f5; padding: 0.4mm 1.2mm; border-radius: 1mm; }
.manual pre { background: #f6f7f8; border-left: 2.5pt solid #c8ccd0; padding: 3mm 3.5mm; font-size: 8.6pt; line-height: 1.5; white-space: pre-wrap; word-break: break-all; page-break-inside: avoid; }
.manual table { border-collapse: collapse; width: 100%; margin: 2.5mm 0 4mm; font-size: 9.4pt; page-break-inside: avoid; }
.manual th, .manual td { border: 0.6pt solid #b8bcc0; padding: 1.6mm 2.2mm; vertical-align: top; }
.manual th { background: #eef0f2; font-weight: 600; }
.manual blockquote { margin: 2.5mm 0; padding: 2mm 4mm; border-left: 2.5pt solid #9aa0a6; background: #f7f8f9; color: #333; }
.manual hr { border: none; border-top: 0.6pt solid #c8ccd0; margin: 6mm 0; }
.manual-cover { page-break-after: always; padding-top: 55mm; text-align: center; }
.manual-cover .mc-kicker { font-size: 11pt; letter-spacing: 2pt; color: #555; }
.manual-cover .mc-title { font-size: 32pt; font-weight: 700; letter-spacing: 6pt; margin: 14mm 0 4mm; }
.manual-cover .mc-sub { font-size: 16pt; letter-spacing: 3pt; color: #333; }
.manual-cover .mc-rule { width: 40mm; height: 2.5pt; background: #111; margin: 14mm auto; }
.manual-cover .mc-table { width: 130mm; margin: 0 auto; font-size: 10.5pt; text-align: left; }
.manual-cover .mc-table td { border: none; border-bottom: 0.5pt solid #d4d7da; padding: 2.6mm 0; }
.manual-cover .mc-table td:first-child { width: 34mm; color: #555; }
`;

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(join(root, 'noop.js'))(name);
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 把一段代码行渲染成带行号的 HTML。
 *
 * 极简高亮：注释 + 字符串 + 关键字。目的是让 60 页打印稿**可读**，
 * 不是搞花哨的高亮（花哨高亮在等宽小字号下反而更难认）。
 *
 * ⚠ 必须**先切段再高亮**。第一版是「先全局替换字符串 → 再全局替换关键字」，
 * 结果关键字正则把刚插进去的 `<span class="st">` 里的 `class` 也匹配了，
 * 标签被嵌套破坏 → 浏览器把 `class="st">` 当普通文本吐出来，整页排版全乱。
 * 正确做法：先把行切成「代码 / 字符串 / 注释」三类，只在**代码段**跑关键字正则
 * （代码段里还没有任何标签，不会误伤属性名）。
 *
 * 另外 `white-space: pre` 的坑：`.code` 里各行之间如果用 `\n` 连接，
 * 那个换行符会被当成**额外的空行**渲染出来（每页只能排下 26 行而不是 50 行）。
 * 所以行与行之间直接拼接（join(''))，换行完全由 `.ln { display:block }` 负责。
 */
function renderLine(line, lineNo) {
  const src = esc(line);

  // ── ① 切段：字符串 / 注释 / 代码 ──────────────────
  const segs = [];
  let buf = '';
  let i = 0;
  const flushCode = () => {
    if (buf) {
      segs.push({ kind: 'code', text: buf });
      buf = '';
    }
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'" || ch === '"') {
      // 字符串：找同引号的下一个（不处理转义，够用）
      flushCode();
      let j = i + 1;
      while (j < src.length && src[j] !== ch) j += 1;
      const end = Math.min(j, src.length - 1);
      segs.push({ kind: 'str', text: src.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      flushCode();
      segs.push({ kind: 'cm', text: src.slice(i) });
      i = src.length;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flushCode();

  // ── ② 只在代码段跑关键字高亮 ─────────────────────
  const KEYWORDS =
    /\b(function|const|let|var|return|if|else|for|while|export|import|from|class|new|await|async|default|typeof|try|catch|throw|switch|case|break|continue|of|in)\b/g;
  const html = segs
    .map((s) => {
      if (s.kind === 'str') return `<span class="st">${s.text}</span>`;
      if (s.kind === 'cm') return `<span class="cm">${s.text}</span>`;
      return s.text.replace(KEYWORDS, '<span class="fn">$1</span>');
    })
    .join('');

  return `<span class="ln"><span class="ln-no">${lineNo}</span>${html || '&nbsp;'}</span>`;
}

/** 拼源程序合集：每行是 {text, no}，no 是**打印稿上的连续行号**。文件之间插文件头注释。 */
function collectSource() {
  const lines = [];
  const seen = new Set();
  let no = 0;
  const push = (text) => {
    no += 1;
    lines.push({ text, no });
  };
  for (const logical of SOURCE_FILES) {
    const abs = join(REPO_ROOT, PATH_FIX(logical));
    if (!existsSync(abs)) {
      console.warn(`⚠ 源文件不存在，跳过：${logical}`);
      continue;
    }
    const rel = relative(REPO_ROOT, abs);
    if (seen.has(rel)) continue;
    seen.add(rel);
    push(`/* ===== 文件：${rel} ===== */`);
    const body = readFileSync(abs, 'utf8').split('\n');
    for (const l of body) {
      // 超长行折行后，行号仍按**原始行**递增 —— 折出来的续行共用原行号，
      // 这样打印稿上的行号与源码文件里的行号仍然对得上（审查时能核对）。
      const wrapped = wrapLine(l);
      const origNo = no + 1;
      for (let i = 0; i < wrapped.length; i += 1) {
        no += 1;
        lines.push({ text: wrapped[i], no: i === 0 ? String(origNo) : `${origNo}*` });
      }
    }
  }
  return lines;
}

/** 把合集切成页（每页 LINES_PER_PAGE 行）。 */
function paginate(lines) {
  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  return pages;
}

/** 生成源程序 HTML。返回 {html, pageCount, keptPages}。 */
function buildSourceHtml(allPages, totalLines) {
  const total = allPages.length;
  let pages;
  let keptPages;
  if (total <= HEAD_PAGES + TAIL_PAGES) {
    pages = allPages;
    keptPages = total;
  } else {
    const head = allPages.slice(0, HEAD_PAGES);
    const tail = allPages.slice(total - TAIL_PAGES);
    const omitted = total - HEAD_PAGES - TAIL_PAGES;
    // 中间插一页「省略说明」—— 软著允许省略中段，但要在文档里说清楚省略了什么。
    const notice = {
      omitted: true,
      from: HEAD_PAGES + 1,
      to: total - TAIL_PAGES,
      omittedPages: omitted,
      omittedLines: omitted * LINES_PER_PAGE,
    };
    pages = [...head, [{ ...notice }], ...tail];
    keptPages = HEAD_PAGES + TAIL_PAGES + 1;
  }

  const body = pages
    .map((page, idx) => {
      const pageNo = idx + 1;
      if (page[0] && page[0].omitted) {
        const n = page[0];
        return `<div class="page">
  <div class="page-header">
    <span class="ph-title">${esc(SOFTWARE.header)}</span>
    <span class="ph-meta">著作权人：${esc(SOFTWARE.owner)}　｜　第 ${pageNo} 页 / 共 ${pages.length} 页</span>
  </div>
  <div class="code" style="font-size:11pt; line-height:7mm; color:#333;">
    <div style="margin-bottom:6mm;">【本页为省略说明】</div>
    <div style="margin-bottom:3mm;">本软件源程序共 ${total} 页（每页 ${LINES_PER_PAGE} 行，合计 ${total * LINES_PER_PAGE} 行，含 ${totalLines} 行源码）。</div>
    <div style="margin-bottom:3mm;">按登记要求，仅提交前 ${HEAD_PAGES} 页与后 ${TAIL_PAGES} 页，中间第 ${n.from} 页至第 ${n.to} 页（共 ${n.omittedPages} 页、约 ${n.omittedLines} 行）予以省略。</div>
    <div style="margin-bottom:3mm;">省略部分为上述文件的连续中间段源码，内容与前后段连续可衔接。</div>
    <div>软件名称：${esc(SOFTWARE.name)} ${esc(SOFTWARE.version)}　　著作权人：${esc(SOFTWARE.owner)}</div>
  </div>
  <div class="page-footer">
    <span>${esc(SOFTWARE.name)} ${esc(SOFTWARE.version)}　源程序</span>
    <span>第 ${pageNo} 页 / 共 ${pages.length} 页</span>
  </div>
</div>`;
      }
      const code = page.map((l) => renderLine(l.text, l.no)).join('');
      const first = idx === 0 ? 1 : null;
      return `<div class="page">
  <div class="page-header">
    <span class="ph-title">${esc(SOFTWARE.header)}</span>
    <span class="ph-meta">著作权人：${esc(SOFTWARE.owner)}　｜　第 ${pageNo} 页 / 共 ${pages.length} 页</span>
  </div>
  <div class="code">
${code}
  </div>
  <div class="page-footer">
    <span>${esc(SOFTWARE.name)} ${esc(SOFTWARE.version)}　源程序</span>
    <span>第 ${pageNo} 页 / 共 ${pages.length} 页</span>
  </div>
</div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(SOFTWARE.name)} 源程序</title>
<style>${CSS}</style></head>
<body>
${body}
</body></html>`;

  return { html, pageCount: pages.length, keptPages, totalPages: total };
}

const MANUAL_COVER = `
<div class="manual-cover">
  <div class="mc-kicker">软件著作权登记 · 用户手册</div>
  <div class="mc-title">${esc(SOFTWARE.name)}</div>
  <div class="mc-sub">软件说明书</div>
  <div class="mc-rule"></div>
  <table class="mc-table">
    <tr><td>软件名称</td><td>${esc(SOFTWARE.name)}（${esc(SOFTWARE.nameEn)}）</td></tr>
    <tr><td>版本号</td><td>${esc(SOFTWARE.version)}</td></tr>
    <tr><td>软件类别</td><td>AIUI 智能体（运行于 Rokid AI Glasses 智能眼镜）</td></tr>
    <tr><td>著作权人</td><td>${esc(SOFTWARE.owner)}</td></tr>
    <tr><td>开发完成日期</td><td>2026 年 11 月</td></tr>
    <tr><td>首次发表日期</td><td>未发表</td></tr>
  </table>
</div>
`;

/** 去掉正文开头的 H1 与元信息块（封面已承载）。 */
function stripLeadBlock(text) {
  const lines = text.split('\n');
  let i = 0;
  // 跳过 H1
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && lines[i].startsWith('# ')) i++;
  // 跳过 `**键**：值` 形式的元信息行
  while (i < lines.length && (!lines[i].trim() || /^\*\*[^*]+\*\*/.test(lines[i]))) i++;
  // 跳到第一个 `---` 分隔线之后
  while (i < lines.length && lines[i].trim() !== '---') i++;
  if (i < lines.length) i++; // 吃掉分隔线本身
  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

async function main() {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : 'all';

  mkdirSync(OUT_DIR, { recursive: true });

  const { chromium } = requireGlobal('playwright');
  const browser = await chromium.launch();
  const work = join(tmpdir(), `ziwei-copyright-${process.pid}`);
  mkdirSync(work, { recursive: true });

  try {
    // ── ① 源程序打印稿 ─────────────────────────────
    if (only === 'all' || only === 'source') {
      const srcFiles = SOURCE_FILES.map(PATH_FIX).map((p) => join(REPO_ROOT, p));
      const present = srcFiles.filter((f) => existsSync(f));

      const terms = loadTerms();
      const scan = scanFiles(present, terms);
      if (scan.violations.length) {
        console.error('✗ 合规门禁未通过，拒绝生成对外材料：');
        for (const v of scan.violations) console.error(`  ${v.file}:${v.line} [${v.term}] ${v.text}`);
        process.exit(1);
      }

      const lines = collectSource();
      const allPages = paginate(lines);
      const totalLines = lines.length;
      const { html, pageCount, totalPages } = buildSourceHtml(allPages, totalLines);

      const htmlPath = join(work, 'source.html');
      writeFileSync(htmlPath, html, 'utf8');
      const outPath = join(OUT_DIR, `${SOFTWARE.name}-源程序.pdf`);
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
      await page.pdf({
        path: outPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      await page.close();
      console.log(
        `✓ 源程序打印稿：${outPath}\n  源程序 ${totalLines} 行 → 原始 ${totalPages} 页；提交版 ${pageCount} 页（前 ${HEAD_PAGES} + 后 ${TAIL_PAGES} + 省略说明 1）`
      );
      if (totalPages < HEAD_PAGES + TAIL_PAGES) {
        console.log(`  ⚠ 原始页数不足 60 页，已全部提交（软著要求不足 60 页时全部提交）。`);
      }
    }

    // ── ② 说明书打印稿 ─────────────────────────────
    if (only === 'all' || only === 'manual') {
      const mdPath = join(OUT_DIR, '软件说明书.md');
      if (!existsSync(mdPath)) {
        console.error(`✗ 找不到说明书源文件：${mdPath}`);
        process.exit(1);
      }
      const md = readFileSync(mdPath, 'utf8');
      // 去掉正文开头的 H1 与元信息块（封面已承载）。
      // ⚠️ 第一版的正则 `^\*\*[^\n]*\*\*\n(.*\n)*?\n---\n` 剥不掉 ——
      //    元信息首行是 `**软件名称**：紫微星盘`，`**` 后面还跟着 `：紫微星盘`，
      //    `\*\*` 直接跟 `\n` 的假设不成立 → 元信息块原样进了 PDF 正文。
      //    改成按行判断：从 H1 之后开始，跳过所有 `**` 开头的元信息行，
      //    一直跳到第一个 `---` 分隔线。
      const body = stripLeadBlock(md);

      const cleanPath = join(work, 'manual.md');
      const tplPath = join(work, 'manual.tpl');
      const htmlPath = join(work, 'manual.html');
      writeFileSync(cleanPath, body, 'utf8');
      writeFileSync(
        tplPath,
        `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(SOFTWARE.name)} 软件说明书</title>
<style>${CSS}</style></head>
<body>
${MANUAL_COVER}
$body$
</body></html>`,
        'utf8'
      );

      run('pandoc', [
        cleanPath,
        '-f', 'gfm',
        '-t', 'html5',
        '--standalone',
        '--template', tplPath,
        '--metadata', `title=${SOFTWARE.name} 软件说明书`,
        '-o', htmlPath,
      ]);

      const outPath = join(OUT_DIR, `${SOFTWARE.name}-软件说明书.pdf`);
      const page = await browser.newPage();
      await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
      await page.pdf({
        path: outPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      await page.close();
      console.log(`✓ 说明书打印稿：${outPath}`);
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error('✗ 生成失败：', e);
  process.exit(1);
});
