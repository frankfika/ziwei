#!/usr/bin/env node
/**
 * 生成提审预览视频（MP4）—— 盘面 → 解读 → 追问 → 运限层，一条连续动线。
 *
 * 为什么需要它：
 *   AIUI Studio 提审页的「预览素材」要求 **共 3–5 个，且至少包含 1 个图片和 1 个视频**
 *   （JPG / PNG / MP4）。图片早就有了，**视频没有**，而真机视频要等样机到货。
 *   样机是「先到先得」，本子又必须先上架才能交初赛作品 —— 提审这条链不能被设备卡住。
 *
 * 画面不是手绘的、也不是录像回放：
 *   · **真实页面逻辑** —— 直接加载 `pages/index/index.ink` 的 `<script setup>`，
 *     用最小 Ink 运行时跑真实的 `onLoad` / `onKeyUp`（同 `simulate-first-launch.mjs` 的路子）；
 *   · **真实端侧引擎** —— `assets/engine.js` 算盘；
 *   · **真实后端解读** —— `/api/agent/reading` 与 `/api/agent/ask`（生产域名），
 *     解读正文是数据集原文检索的结果；
 *   · **真实 Ink 样式** —— `<style>` 段原样套用，布局像素与眼镜上一致。
 *
 * ⚠️ **这是「模拟器渲染」不是「真机录像」** —— 仓库规矩（`render-board-preview.mjs` 抬头）：
 *   对外使用必须标注，不能冒充真机。所以视频底部**常驻一行**「AIUI Studio 模拟器渲染」。
 *   初赛「作品真机视频」按赛规要求**必须真机录**，这份视频替代不了那一条。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/render-preview-video.mjs
 *   node apps/rokid-agent/scripts/render-preview-video.mjs --fps 24 --out xxx.mp4
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_ROOT } from './forbidden-terms.mjs';

const REPO = path.resolve(AGENT_ROOT, '..', '..');
const INK_PAGE = path.join(AGENT_ROOT, 'pages', 'index', 'index.ink');
const OUT_DIR = path.join(AGENT_ROOT, 'submit-kit', 'preview');

/** 眼镜画布的真实尺寸（`page { width:480px; height:352px }`） */
const CANVAS_W = 480;
const CANVAS_H = 352;
/** 输出倍率：2 倍原生 = 960×704，布局与眼镜上逐像素一致 */
const SCALE = 2;

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))(name);
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ *
 * 1. 加载真实页面
 * ------------------------------------------------------------------ */

/**
 * 把 `.ink` 的 `<script setup>` 抠出来改写成可被 node 直接 import 的 ESM。
 * 相对导入必须换成绝对 file:// URL，否则会解析到临时目录。
 */
async function loadPageModule() {
  const ink = fs.readFileSync(INK_PAGE, 'utf8');
  const start = ink.indexOf('<script setup>');
  const end = ink.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error('index.ink 里找不到 <script setup> 块');

  let body = ink.slice(start + '<script setup>'.length, end);
  const libDir = path.join(AGENT_ROOT, 'lib');
  body = body.replace(
    /from\s+'\.\.\/\.\.\/lib\/([^']+)'/g,
    (_m, rel) => `from '${pathToFileURL(path.join(libDir, rel)).href}'`,
  );

  const tmp = path.join(os.tmpdir(), `ziwei-ink-setup-video-${process.pid}.mjs`);
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/** 最小 Ink 运行时：setData / data / finish，页面逻辑一行不改 */
function makePage(def) {
  const page = Object.create(def);
  page.data = JSON.parse(JSON.stringify(def.data || {}));
  page.setData = function setData(patch) {
    Object.assign(this.data, patch || {});
  };
  page.finish = function finish() {
    this._finished = true;
  };
  return page;
}

/**
 * 按一次键。
 *
 * ⚠️ 必须间隔开：`index.ink` 的 `onKeyUp` 里有同键去抖
 * （`shouldAcceptKey`，150ms 窗口内**相同 code 的重复上报直接丢弃**）——
 * 连发两次 Enter，第二次会被静默吞掉（表现为「追问发不出去」）。
 * 所以每次按键前先睡 220ms。
 */
async function press(page, code, waitMs = 220) {
  await new Promise((r) => setTimeout(r, waitMs));
  page.onKeyUp({ code, preventDefault() {} });
}

async function waitFor(predicate, timeoutMs = 20000, label = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`等待超时（${label}）`);
}

/* ------------------------------------------------------------------ *
 * 2. 渲染板（沿用 simulate-first-launch 的真实样式 + 真实数据）
 * ------------------------------------------------------------------ */

function readStyle() {
  const ink = fs.readFileSync(INK_PAGE, 'utf8');
  return ink.slice(ink.indexOf('<style>') + 7, ink.indexOf('</style>'));
}

function boardHtml(d) {
  const cellHtml = (d.cells || [])
    .map(
      (c) => `      <view class="cell p${c.branch} ${c.activeClass}">
        <view class="cell-head">
          <view class="head-left">
            <text class="palace-name">${esc(c.name)}</text>
            ${c.fortuneShort ? `<text class="fortune-name">${esc(c.fortuneShort)}</text>` : ''}
          </view>
          <text class="gan-zhi">${esc(c.stemName)}${esc(c.branchName)}</text>
        </view>
        <text class="major">${esc(c.majorText)}</text>
        <text class="minor">${esc(c.minorText)}</text>
      </view>`,
    )
    .join('\n');

  const center = d.center || {};
  const role = d.layerRole ? `          <text class="center-role">${esc(d.layerRole)}</text>` : '';

  return `    <view class="board">
${cellHtml}
      <view class="center">
        <text class="center-title">${esc(d.layerTitle)}</text>
        <text class="center-line">命主 ${esc(center.mingZhu)}　身主 ${esc(center.shenZhu)}</text>
        <text class="center-line dim">${esc(d.layerSub)}</text>
        <text class="center-line dim">${esc(d.layerExtra)}</text>
        <text class="center-line dim">${esc(center.pillarsText)}</text>
        <view class="center-divider"></view>
        <view class="selected-row">
          <text class="center-line strong">${esc(d.selectedName)}</text>
${role}
        </view>
        <text class="center-hint">确认键听解读　${esc(d.navHint)}</text>
        <text class="center-hint dim">${esc(d.statusLine)}</text>
${d.demoLabel ? `        <text class="center-hint demo">${esc(d.demoLabel)}</text>` : ''}
      </view>
    </view>`;
}

/** 解读/追问浮层：结构与 `index.ink` 的模板一一对应 */
function overlayHtml({ title, dim, strong, text, note, hint, loading = false }) {
  return `    <view class="overlay">
      <text class="overlay-title">${esc(title)}</text>
      ${dim ? `<text class="overlay-body dim">${esc(dim)}</text>` : ''}
      ${strong ? `<text class="overlay-body strong">${esc(strong)}</text>` : ''}
      <view class="reading-scroll"><text class="reading-text${loading ? ' dim' : ''}" data-role="body"></text></view>
      ${note ? `<text class="overlay-note">${esc(note)}</text>` : ''}
      <text class="overlay-note">传统文化学习与研究用 · 不构成医疗、法律、投资或人生决策建议</text>
      <text class="overlay-hint">${esc(hint)}</text>
    </view>`;
}

/* ------------------------------------------------------------------ *
 * 3. 驱动真实状态机，取四个场景
 * ------------------------------------------------------------------ */

async function collectScenes() {
  const mod = await loadPageModule();
  const page = makePage(mod.default);

  // 真实首启：带生辰入参（不带入参会落到内置示例盘，界面上会写「示例盘」）
  const query = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' };
  await page.onLoad(query);
  await waitFor(() => page.data.ready, 15000, '首屏 ready');
  if (!page.data.cells || page.data.cells.length !== 12) {
    throw new Error(`盘面宫位数不是 12（是 ${(page.data.cells || []).length}）`);
  }

  const scenes = {};

  // 场景 A：本命盘，命宫选中
  scenes.boardA = boardHtml(page.data);

  // 场景 B/C：真实按键推进选宫（沿外圈巡宫）
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  scenes.boardB = boardHtml(page.data);
  await press(page, 'ArrowRight');
  scenes.boardC = boardHtml(page.data);

  // 回到命宫：解读要对着命宫取
  const mingCell = (page.data.cells || []).find((c) => c.name === '命宫');
  if (mingCell) {
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
    await press(page, 'ArrowLeft');
  }
  await waitFor(
    () => (page.data.cells || []).some((c) => c.name === '命宫' && /active|selected|on/i.test(c.activeClass || '')),
    3000,
    '选回命宫',
  ).catch(() => {});

  // 场景 D：解读浮层（真实后端检索）
  await press(page, 'Enter');
  await waitFor(() => page.data.overlay === 'reading', 5000, '解读浮层打开');
  await waitFor(() => page.data.readingLoading === false, 25000, '解读正文返回');
  const readingText = page.data.readingText || '';
  if (readingText.length < 40) {
    throw new Error(`解读正文太短（${readingText.length} 字），疑似后端没返回：${readingText}`);
  }
  scenes.readingText = readingText;
  scenes.readingTitle = page.data.readingTitle || '';
  scenes.readingDim = page.data.readingDimension || '';
  scenes.readingCitation = page.data.readingCitation || '';

  // 场景 E：追问浮层（真实后端问答）
  await press(page, 'Enter');
  await waitFor(() => page.data.overlay === 'ask', 5000, '追问浮层打开');
  const askQuestion = page.data.askQuestion || '';
  const askFocus = page.data.askFocus || '';
  await press(page, 'Enter');
  await waitFor(() => page.data.askLoading === false, 60000, '追问回答返回');
  const askAnswer = page.data.askAnswer || '';
  if (askAnswer.length < 20) {
    throw new Error(`追问回答太短（${askAnswer.length} 字），疑似后端没返回：${askAnswer}`);
  }
  scenes.askQuestion = askQuestion;
  scenes.askFocus = askFocus;
  scenes.askAnswer = askAnswer;
  scenes.askCitation = page.data.askCitation || '';

  // 场景 F：关掉浮层，切到运限层（运限小标出现 = 四层时间层的证据）
  await press(page, 'Backspace');
  await waitFor(() => page.data.overlay === '', 3000, '浮层关闭');
  for (let i = 0; i < 4; i += 1) {
    await press(page, 'ArrowUp');
    if (page.data.layerKey === 'liunian') break;
  }
  if (page.data.layerKey !== 'liunian') {
    // 退而求其次：任意运限层都行，但要在提示里说明
    console.warn(`  ⚠️ 没切到流年层，当前是 ${page.data.layerKey}`);
  }
  scenes.layerKey = page.data.layerKey;
  scenes.boardD = boardHtml(page.data);

  scenes.meta = {
    selectedName: page.data.selectedName,
    layerTitle: page.data.layerTitle,
    sourceLabel: page.data.sourceLabel,
    readingLen: readingText.length,
    askLen: askAnswer.length,
    layerKey: page.data.layerKey,
  };

  return scenes;
}

/* ------------------------------------------------------------------ *
 * 4. 时间线页面 —— 一个页面 + seek(t)，Node 逐帧驱动
 * ------------------------------------------------------------------ */

/** 场景淡入淡出：返回 0..1 */
function ramp(t, start, end, fade) {
  if (t <= start || t >= end) return 0;
  if (t < start + fade) return (t - start) / fade;
  if (t > end - fade) return (end - t) / fade;
  return 1;
}

/** 逐字显现：返回 0..1 */
function rampIn(t, start, end) {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}

function buildTimelineHtml(scenes, style, totalSeconds) {
  const readingOverlay = overlayHtml({
    title: scenes.readingTitle,
    dim: scenes.readingDim,
    text: scenes.readingText,
    note: scenes.readingCitation,
    hint: '确认键追问　返回键退出',
  });
  const askOverlay = overlayHtml({
    title: '追问',
    strong: scenes.askQuestion,
    dim: scenes.askFocus,
    text: scenes.askAnswer,
    note: scenes.askCitation,
    hint: '上下键选问题　确认键发送　返回键退出',
  });

  return `<!doctype html><html><head><meta charset="utf-8">
<style>${style}
view, text, scroll-view { display: block; }
text { display: inline; }
page { display: block; }
html, body { margin: 0; padding: 0; background: #000; }
#stage { position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: #000; overflow: hidden; }
.scene { position: absolute; left: 0; top: 0; width: ${CANVAS_W}px; height: ${CANVAS_H}px; opacity: 0; }
.reading-scroll { height: 198px; overflow: hidden; position: relative; }
.reading-scroll .reading-text { position: absolute; left: 0; top: 0; width: 448px; }
/* 角标靠右下角 —— 左下角是 .overlay-hint 的位置（「确认键追问　返回键退出」），
   放左下会压字。 */
.caption { position: absolute; right: 16px; bottom: 2px; font-size: 8px; line-height: 11px; color: #2f6b47; font-family: monospace; }
</style></head><body>
<div id="stage">
  <div class="scene" id="s-a">${scenes.boardA}</div>
  <div class="scene" id="s-b">${scenes.boardB}</div>
  <div class="scene" id="s-c">${scenes.boardC}</div>
  <div class="scene" id="s-r">${readingOverlay}</div>
  <div class="scene" id="s-q">${askOverlay}</div>
  <div class="scene" id="s-d">${scenes.boardD}</div>
  <text class="caption">AIUI Studio 模拟器渲染</text>
</div>
<script>
(function () {
  var READING = ${JSON.stringify(scenes.readingText)};
  var ANSWER = ${JSON.stringify(scenes.askAnswer)};
  var TOTAL = ${totalSeconds};

  function clip(n, len) { return Math.max(0, Math.min(len, Math.round(n))); }

  function fade(t, s, e, f) {
    if (t <= s || t >= e) return 0;
    if (t < s + f) return (t - s) / f;
    if (t > e - f) return (e - t) / f;
    return 1;
  }

  function set(id, v) { document.getElementById(id).style.opacity = String(v); }

  function revealText(sceneId, full, from, to) {
    var el = document.querySelector('#' + sceneId + ' .reading-text');
    if (!el) return;
    var t = window.__t;
    var p = 0;
    if (t > from) p = (t - from) / (to - from);
    var n = clip(p * full.length, full.length);
    if (el.textContent.length !== n) el.textContent = full.slice(0, n);

    // scroll-view：让最新显现的行保持在可视区（真机上是可滚动的）。
    // 用元素实际高度算，不用「每行 N 字」的估算 —— 估算会差一行，末尾被裁掉。
    var wrap = el.parentElement;
    var visible = wrap.clientHeight;
    var contentH = el.offsetHeight;
    var maxScroll = Math.max(0, contentH - visible);
    var scroll = Math.min(maxScroll, Math.max(0, contentH - visible));
    el.style.transform = 'translateY(' + (-scroll) + 'px)';
  }

  window.__seek = function (t) {
    window.__t = t;
    var F = 0.45;

    // A：本命盘，命宫
    set('s-a', fade(t, 0.0, 3.0, F));
    // B：巡宫（准星移到财帛/官禄一带）
    set('s-b', fade(t, 2.7, 5.0, F));
    // C：再移一宫
    set('s-c', fade(t, 4.7, 7.0, F));
    // D：解读浮层，正文逐字
    set('s-r', fade(t, 6.7, 11.0, F));
    revealText('s-r', READING, 7.1, 10.6);
    // E：追问浮层，回答逐字
    set('s-q', fade(t, 10.7, 15.2, F));
    revealText('s-q', ANSWER, 11.4, 14.6);
    // F：回到盘面，切到运限层（运限小标出现）
    set('s-d', fade(t, 15.0, 18.0, F));
  };

  window.__seek(0);
})();
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * 5. 逐帧截图 → ffmpeg → MP4
 * ------------------------------------------------------------------ */

async function renderVideo(scenes, outFile, fps) {
  const style = readStyle();
  const totalSeconds = 18.0;
  const html = buildTimelineHtml(scenes, style, totalSeconds);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, 'preview-video-timeline.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-video-frames-'));
  const { chromium } = requireGlobal('playwright');
  const browser = await chromium.launch();
  let frameCount = 0;
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS_W, height: CANVAS_H },
      deviceScaleFactor: SCALE,
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    const total = Math.round(totalSeconds * fps);
    for (let i = 0; i < total; i += 1) {
      const t = i / fps;
      await page.evaluate((tt) => window.__seek(tt), t);
      await page.screenshot({ path: path.join(framesDir, `f${String(i).padStart(5, '0')}.png`) });
      frameCount += 1;
    }
  } finally {
    await browser.close();
  }

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'f%05d.png'),
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outFile,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  fs.rmSync(framesDir, { recursive: true, force: true });
  return frameCount;
}

function ffprobe(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

/* ------------------------------------------------------------------ */

async function main() {
  const fps = Number(arg('--fps', '30'));
  const outFile = arg('--out', path.join(OUT_DIR, 'ziwei-preview.mp4'));

  console.log('── 收集真实状态 ───────────────────────────────────────────');
  const scenes = await collectScenes();
  console.log(`  解读正文   : ${scenes.meta.readingLen} 字（后端原文检索）`);
  console.log(`  追问回答   : ${scenes.meta.askLen} 字（后端检索 + 推演）`);
  console.log(`  运限层     : ${scenes.meta.layerKey}｜${scenes.meta.layerTitle}`);
  console.log(`  计算来源   : ${scenes.meta.sourceLabel}`);

  console.log('── 渲染帧 ────────────────────────────────────────────────');
  const frames = await renderVideo(scenes, outFile, fps);
  console.log(`  ${frames} 帧 @ ${fps}fps`);

  const probe = ffprobe(outFile);
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const size = fs.statSync(outFile).size;
  console.log('── 产物 ──────────────────────────────────────────────────');
  console.log(`  ${outFile}`);
  console.log(
    `  ${v.width}×${v.height}｜${v.codec_name}｜${Number(probe.format.duration).toFixed(1)}s｜${(size / 1024 / 1024).toFixed(2)} MB`,
  );
  if (v.codec_name !== 'h264') throw new Error(`编码不是 h264（是 ${v.codec_name}）`);
  if (v.width !== CANVAS_W * SCALE) throw new Error(`宽度不对（${v.width}）`);
  console.log('✓ 预览视频已生成');
}

main().catch((err) => {
  console.error('✗ 生成失败：', err && err.stack ? err.stack : err);
  process.exit(1);
});
