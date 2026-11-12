#!/usr/bin/env node
/**
 * 生成提审预览视频（MP4）—— 盘面 → 问这宫 → 追问 → 回盘面 → 切层，一条连续动线。
 *
 * 为什么需要它：
 *   AIUI Studio 提审页的「预览素材」要求 **共 3–5 个，且至少包含 1 个图片和 1 个视频**
 *   （JPG / PNG / MP4）。图片早就有了，**视频没有**，而真机视频要等样机到货。
 *   样机是「先到先得」，本子又必须先上架才能交初赛作品 —— 提审这条链不能被设备卡住。
 *
 * 画面不是手绘的、也不是录像回放：
 *   · **真实页面逻辑** —— 直接加载 `pages/index/index.ink` 的 `<script setup>`，
 *     用最小 Ink 运行时跑真实的 `onLoad` / `onKeyUp`；
 *   · **真实端侧引擎** —— `assets/engine.js` 算盘；
 *   · **真实后端解读 / 追问** —— `/api/agent/reading` 与 `/api/agent/ask`（生产域名）；
 *   · **真实 Ink 样式** —— `<style>` 段原样套用，布局像素与眼镜上一致。
 *
 * ⚠️ **这一版（第二十六轮重写）的动线跟着交互重做一起改了**：
 *   旧脚本驱的是「盘面 → 解读浮层 → 追问浮层」三个整屏浮窗，
 *   而第二十五轮把交互改成了「盘面页（中宫＝常驻对话区）+ 对话页（会话流）+ 录入页」。
 *   旧脚本的 `overlay==='reading'/'ask'`、`readingText`、`askAnswer`、`navHint`
 *   在新页面上**全部不存在**，照旧跑必然报错或渲染出「文档里的界面」。
 *   现在这条动线是：
 *     盘面（空态：中宫＝引导语＋建议语）
 *       → 滑动选宫
 *       → 单击「问这一宫」→ 对话页（会话流出现一问，正在推演）
 *       → 解读正文落地（原文检索 + 引文模式披露）
 *       → 双击「问建议语」→ 第二轮（不依赖语音识别的兜底路径）
 *       → 第二轮落地（多轮会话可见）
 *       → 回盘面页（中宫仍显示最近一问一答 —— 这一版最要紧的改动）
 *       → 双击切时间层（大限层，运限小标出现）
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
import { readStyle, renderBoardHtml, renderChatHtml } from './preview-html.mjs';

const REPO = path.resolve(AGENT_ROOT, '..', '..');
const INK_PAGE = path.join(AGENT_ROOT, 'pages', 'index', 'index.ink');
const OUT_DIR = path.join(AGENT_ROOT, 'submit-kit', 'preview');

/** 眼镜画布的真实尺寸（`page { width:480px; height:352px }`） */
const CANVAS_W = 480;
const CANVAS_H = 352;
/** 输出倍率：2 倍原生 = 960×704，布局与眼镜上逐像素一致 */
const SCALE = 2;

/** 成片时长（秒） */
const TOTAL_SECONDS = 21.2;

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))(name);
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
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
 * ⚠️ 必须间隔开：`index.ink` 的按键处理里有**同键回声抑制**
 * （`lib/temple-input.js` 的 `upEchoMs` = 120ms，窗口内同键的重复抬起直接丢弃），
 * 连发两次会被静默吞掉。所以每次按键前先睡 420ms。
 */
async function press(page, code, waitMs = 420) {
  await new Promise((r) => setTimeout(r, waitMs));
  page.onKeyUp({ code, preventDefault() {} });
}

/**
 * 双击（= 盘面页切层 / 对话页问建议语）。
 *
 * 契约见 `apps/rokid-agent/lib/temple-input.js`：
 *   双击 = `GlobalHook` ×2（约 200ms 间隔）→ 补发 `Backspace`。
 *
 * ⚠️ **两次 GlobalHook 的间隔必须小于 settleMs（300ms）**：
 * 间隔一旦超过挂起窗口，挂起会先到期 → 误确认一次。
 * （真机双击间隔约 200ms，模拟器这里用 120ms 留足余量。）
 *
 * ⚠️ **双击之后 900ms 内不能按裸 `Backspace`**：
 * 双击候选窗口（`doubleTapWindowMs`）还没过期，裸返回键会被误判成双击。
 */
async function doubleTap(page) {
  await new Promise((r) => setTimeout(r, 420));
  page.onKeyUp({ code: 'GlobalHook', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 120));
  page.onKeyUp({ code: 'GlobalHook', preventDefault() {} });
  await new Promise((r) => setTimeout(r, 120));
  page.onKeyUp({ code: 'Backspace', preventDefault() {} });
}

async function waitFor(predicate, timeoutMs = 20000, label = '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`等待超时（${label}）`);
}

/** 深拷贝页面状态 —— 之后页面还会继续变，场景必须定格在拍下的那一刻 */
function snap(page) {
  return JSON.parse(JSON.stringify(page.data));
}

/* ------------------------------------------------------------------ *
 * 2. 驱动真实状态机，取场景
 * ------------------------------------------------------------------ */

/**
 * 场景清单。
 *
 * 每项 = { id, kind, data, in, out, fade, reveals }
 *   kind    —— board / chat，决定用哪个渲染器
 *   in/out  —— 出现在时间线上的区间（秒）
 *   fade    —— 交叉淡入淡出的时长（0 = 硬切）
 *   reveals —— 逐字显现的正文（每条 { sel, from, to, scroll }）
 */
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

  const scenes = [];

  /* ---- 场景 1：盘面页首屏（中宫 = 引导语 + 建议语） ---- */
  scenes.push({
    id: 's1',
    kind: 'board',
    data: snap(page),
    in: 0.0,
    out: 3.3,
    fade: 0.5,
  });

  /* ---- 场景 2：滑动选宫（准星移位，中宫焦点行跟着变） ---- */
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  await waitFor(
    () => (page.data.cells || []).some((c) => /active|selected|on/i.test(c.activeClass || '')),
    3000,
    '选宫生效',
  ).catch(() => {});
  scenes.push({
    id: 's2',
    kind: 'board',
    data: snap(page),
    in: 3.1,
    out: 5.7,
    fade: 0.3,
  });

  /* ---- 场景 3：单击「问这一宫」→ 对话页（正在推演……） ---- */
  await press(page, 'Enter');
  await waitFor(() => page.data.screen === 'chat', 8000, '切到对话页');
  await waitFor(
    () => (page.data.chatTurns || []).length === 1 && page.data.chatTurns[0].pending,
    8000,
    '第一轮进入等待',
  );
  scenes.push({
    id: 's3',
    kind: 'chat',
    data: snap(page),
    in: 5.5,
    out: 7.7,
    fade: 0.3,
  });

  /* ---- 场景 4：解读正文落地（数据集原文 + 引文模式披露） ---- */
  await waitFor(
    () => (page.data.chatTurns || []).length === 1 && !page.data.chatTurns[0].pending,
    40000,
    '解读正文返回',
  );
  const reading = page.data.chatTurns[0];
  if (!reading || !reading.a || reading.a.length < 40) {
    throw new Error(`解读正文太短（${reading ? reading.a.length : 0} 字），疑似后端没返回`);
  }
  scenes.push({
    id: 's4',
    kind: 'chat',
    data: snap(page),
    in: 7.5,
    out: 11.7,
    fade: 0.4,
    reveals: [{ sel: '#s4 .turn:nth-of-type(1) .turn-a', from: 7.9, to: 11.3, scroll: 'head' }],
  });

  /* ---- 场景 5：双击「问建议语」→ 第二轮（不依赖语音识别的兜底路径） ---- */
  await doubleTap(page);
  await waitFor(
    () => (page.data.chatTurns || []).length === 2 && page.data.chatTurns[1].pending,
    10000,
    '第二轮进入等待',
  );
  scenes.push({
    id: 's5',
    kind: 'chat',
    data: snap(page),
    in: 11.5,
    out: 13.3,
    fade: 0.3,
  });

  /* ---- 场景 6：第二轮落地（多轮会话同时可见） ---- */
  await waitFor(
    () => (page.data.chatTurns || []).length === 2 && !page.data.chatTurns[1].pending,
    150000,
    '追问回答返回',
  );
  const asking = page.data.chatTurns[1];
  if (!asking || !asking.a || asking.a.length < 20) {
    throw new Error(`追问回答太短（${asking ? asking.a.length : 0} 字），疑似后端没返回`);
  }
  scenes.push({
    id: 's6',
    kind: 'chat',
    data: snap(page),
    in: 13.1,
    out: 17.1,
    fade: 0.4,
    reveals: [
      { sel: '#s6 .turn:nth-of-type(1) .turn-a', from: 13.1, to: 13.1, scroll: 'bottom' },
      { sel: '#s6 .turn:nth-of-type(2) .turn-a', from: 13.5, to: 16.7, scroll: 'bottom' },
    ],
  });

  /* ---- 场景 7：回盘面页（中宫仍显示最近一问一答 —— 常驻对话区） ---- */
  await press(page, 'Backspace', 1200);
  await waitFor(() => page.data.screen === 'board', 5000, '回盘面页');
  if (!page.data.digestQuestion) {
    throw new Error('回盘面页后中宫没有摘要（digestQuestion 为空）');
  }
  scenes.push({
    id: 's7',
    kind: 'board',
    data: snap(page),
    in: 16.9,
    out: 19.3,
    fade: 0.4,
  });

  /* ---- 场景 8：双击切时间层（大限层，运限小标出现） ---- */
  if (!page.data.layersReady) {
    console.warn('  ⚠️ 端侧运限层不可用（layersReady=false），切层场景会退成本命盘');
  }
  await doubleTap(page);
  await waitFor(() => page.data.layerKey !== 'natal', 6000, '切到大限层').catch(() => {
    console.warn(`  ⚠️ 没切到运限层，当前是 ${page.data.layerKey}`);
  });
  scenes.push({
    id: 's8',
    kind: 'board',
    data: snap(page),
    in: 19.1,
    out: TOTAL_SECONDS,
    fade: 0.4,
  });

  return {
    scenes,
    meta: {
      layerKey: page.data.layerKey,
      readingLen: reading.a.length,
      askLen: asking.a.length,
      askQuestion: asking.q,
      citation: reading.metaLine || '',
    },
  };
}

/* ------------------------------------------------------------------ *
 * 3. 时间线页面 —— 一个页面 + seek(t)，Node 逐帧驱动
 * ------------------------------------------------------------------ */

function buildTimelineHtml(collected, style) {
  const sceneHtml = collected.scenes
    .map((s) => {
      const html =
        s.kind === 'chat'
          ? renderChatHtml(s.data, style, { innerClass: 'chat-inner' })
          : renderBoardHtml(s.data, style);
      /**
       * 渲染出来的是**完整文档**（`<html><head><style>…`），
       * 这里要的是 `<body>` 里的那一段 ⇒ 抠出来塞进场景容器。
       */
      const bodyStart = html.indexOf('<body>');
      const inner = html.slice(bodyStart + 6, html.indexOf('</body>'));
      return `  <div class="scene" id="${s.id}">${inner}</div>`;
    })
    .join('\n');

  /**
   * 逐字显现的文本清单：`{ 场景选择器 → 完整文本 }`。
   * 完整文本从场景数据里取（不是写死的），保证画面与真实页面一致。
   */
  const revealTexts = {};
  for (const s of collected.scenes) {
    for (const r of s.reveals || []) {
      const m = /#(\w+) \.turn:nth-of-type\((\d+)\) \.turn-a/.exec(r.sel);
      if (!m) continue;
      const turn = (s.data.chatTurns || [])[Number(m[2]) - 1];
      revealTexts[r.sel] = turn ? turn.a || '' : '';
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8">
<style>${style}
view, text, scroll-view { display: block; }
text { display: inline; }
page { display: block; }
html, body { margin: 0; padding: 0; background: #000; }
#stage { position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: #000; overflow: hidden; }
.scene { position: absolute; left: 0; top: 0; width: ${CANVAS_W}px; height: ${CANVAS_H}px; opacity: 0; }
/* 会话流在设备上是可滚动的；预览视频里要**裁掉溢出**，
   否则长文本会盖住页脚，渲染出来的就不是眼镜上那个样子了。 */
.chat-scroll { overflow: hidden; }
.chat-inner { will-change: transform; }
/* 角标靠右下角 —— 左下角是页脚提示行的位置，放左下会压字。 */
.caption { position: absolute; right: 16px; bottom: 2px; font-size: 8px; line-height: 11px; color: #2f6b47; font-family: monospace; }
</style></head><body>
<div id="stage">
${sceneHtml}
  <text class="caption">AIUI Studio 模拟器渲染</text>
</div>
<script>
(function () {
  var SCENES = ${JSON.stringify(
    collected.scenes.map((s) => ({ id: s.id, in: s.in, out: s.out, fade: s.fade })),
  )};
  var REVEALS = ${JSON.stringify(
    collected.scenes.flatMap((s) =>
      (s.reveals || []).map((r) => ({
        scene: s.id,
        sel: r.sel,
        from: r.from,
        to: r.to,
        scroll: r.scroll,
      })),
    ),
  )};
  var TEXTS = ${JSON.stringify(revealTexts)};

  function clip(n, len) { return Math.max(0, Math.min(len, Math.round(n))); }

  function fade(t, s, e, f) {
    if (f <= 0) return (t >= s && t < e) ? 1 : 0;
    if (t <= s || t >= e) return 0;
    if (t < s + f) return (t - s) / f;
    if (t > e - f) return (e - t) / f;
    return 1;
  }

  function set(id, v) {
    var el = document.getElementById(id);
    if (el) el.style.opacity = String(v);
  }

  /**
   * 逐字显现 + 滚动定位。
   *
   * scroll = 'head'  —— **钉住开头**：问题句 + 回答的头几行留在视野里。
   *   回答正文有两千多字，钉开头 = 让观众看到「结论第一句」，
   *   钉末尾 = 观众只看到一大段没有上下文的字。
   * scroll = 'bottom'—— **钉住末尾**：多轮会话时用户看的是最新一轮。
   *
   * ⚠️ 滚动量用元素实际高度算，不用「每行 N 字」的估算 ——
   * 估算会差一行，末尾被裁掉。
   */
  function reveal(sel, text, from, to, scroll) {
    var el = document.querySelector(sel);
    if (!el) return;
    var t = window.__t;
    var p = 0;
    if (t > from) p = (t - from) / Math.max(0.0001, to - from);
    var n = clip(p * text.length, text.length);
    if (el.textContent.length !== n) el.textContent = text.slice(0, n);

    var inner = el.closest('.chat-inner');
    if (!inner) return;
    var wrap = inner.parentElement;
    var visible = wrap.clientHeight;
    var contentH = inner.offsetHeight;
    var maxScroll = Math.max(0, contentH - visible);
    var y = 0;
    if (scroll === 'bottom') {
      y = -maxScroll;
    }
    /**
     * 'head' 保持 y = 0（不滚）——
     * 会话流是 overflow:hidden 的，超出的部分自然被裁掉，
     * 这正是设备上「从头读起、往下滚才看到后面」的样子。
     */
    inner.style.transform = 'translateY(' + y + 'px)';
  }

  window.__seek = function (t) {
    window.__t = t;
    for (var i = 0; i < SCENES.length; i++) {
      var s = SCENES[i];
      set(s.id, fade(t, s.in, s.out, s.fade));
    }
    for (var j = 0; j < REVEALS.length; j++) {
      var r = REVEALS[j];
      if (t < r.from) {
        var el0 = document.querySelector(r.sel);
        if (el0 && el0.textContent.length !== 0) el0.textContent = '';
        continue;
      }
      reveal(r.sel, TEXTS[r.sel] || '', r.from, r.to, r.scroll);
    }
  };

  window.__seek(0);
})();
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * 4. 逐帧截图 → ffmpeg → MP4
 * ------------------------------------------------------------------ */

async function renderVideo(collected, outFile, fps) {
  const style = readStyle();
  const html = buildTimelineHtml(collected, style);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, 'preview-video-timeline.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-video-frames-'));
  const { chromium } = requireGlobal('playwright');
  const browser = await chromium.launch();
  let frameCount = 0;
  /**
   * 丢掉最前面 0.45 秒。
   *
   * 为什么：时间线的第 0 帧页面还没把盘面画出来，是一张**全黑**的图 ——
   * 提审页的预览素材缩略图取的就是首帧，黑色缩略图在商店里很难看。
   * 所以从第 0.45 秒开始取帧（那时盘面已经画完），成片第一帧就是完整盘面。
   */
  const startFrame = Math.round(0.45 * fps);
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS_W, height: CANVAS_H },
      deviceScaleFactor: SCALE,
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    const total = Math.round(TOTAL_SECONDS * fps);
    for (let i = startFrame; i < total; i += 1) {
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
      // 取帧从 startFrame 开始，ffmpeg 要跟着从这一张读，否则找不到 f00000.png
      '-start_number', String(startFrame),
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
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  ).trim();
  return out;
}

async function main() {
  const fps = Number(arg('--fps', '24'));
  const outFile = path.resolve(arg('--out', path.join(OUT_DIR, 'ziwei-preview.mp4')));

  console.log('→ 加载真实页面（pages/index/index.ink 的 <script setup>）');
  const collected = await collectScenes();
  console.log(
    `✓ 采集到 ${collected.scenes.length} 个场景｜解读 ${collected.meta.readingLen} 字｜` +
      `追问 ${collected.meta.askLen} 字｜末层 ${collected.meta.layerKey}`,
  );

  console.log(`→ 渲染视频（${CANVAS_W * SCALE}×${CANVAS_H * SCALE} @${fps}fps，${TOTAL_SECONDS}s）`);
  const frames = await renderVideo(collected, outFile, fps);

  const size = fs.statSync(outFile).size;
  console.log(`✓ ${outFile}`);
  console.log(`  ${frames} 帧 / ${(size / 1024 / 1024).toFixed(2)} MB / ${ffprobe(outFile)}`);
  console.log('  ⚠️ 这是「AIUI Studio 模拟器渲染」，不能冒充真机录像。');
}

main().catch((err) => {
  console.error('✗ 生成失败：', err.message);
  process.exit(1);
});
