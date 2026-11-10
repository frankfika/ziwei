#!/usr/bin/env node
/**
 * 本地首启模拟器 —— **不依赖 Rokid 账号、不依赖 AIUI Studio**。
 *
 * 为什么要它：
 *  · 模拟器里出不了盘这件事，本质是「页面在没有任何出生信息时只能停在输入浮层」。
 *    但 AIUI Studio 模拟器**没有麦克风**，所以旧代码在模拟器里永远走不到出盘那一步 ——
 *    于是每次验证都要等 Rokid 登录、等导入、等模拟器加载，慢且脆。
 *  · 这里直接把 `.ink` 里的 `<script setup>` 当 ESM 加载，配一个**最小 Ink 运行时**
 *    （setData / data / finish），跑真实的 `onLoad`，把真实数据渲染成 PNG。
 *    页面逻辑改一行，这里立刻能看出首屏对不对。
 *
 * 它验证什么：
 *  1. **首启必须出盘**（无入参、无本机存档 → 内置示例盘），不再停在「说出你的生辰」；
 *  2. **端侧引擎真的能加载**（assets/engine.js 动态 import）→ 中宫显示「端侧计算」；
 *  3. **四层运限可用**（layersReady）；
 *  4. **示例盘标注在界面上**，且不会写进本机命盘库；
 *  5. **盘面态的返回键能回到生辰录入**（重新说生辰的唯一入口）；
 *  6. **语音路径**（给了 --asr 才跑）：说完生辰 → 解析 → 排盘 → **关掉录入浮层**，
 *     并在盘面上标出「时辰按午时估算」（缺时辰时的兜底口径）。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/simulate-first-launch.mjs
 *   node apps/rokid-agent/scripts/simulate-first-launch.mjs --no-png
 *   node apps/rokid-agent/scripts/simulate-first-launch.mjs --query year=1988&month=3&day=12&hour=7&gender=female
 *   node apps/rokid-agent/scripts/simulate-first-launch.mjs --no-png --asr "1990年1月1日 我不知道时辰 男"
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
const OUT_PNG = path.join(AGENT_ROOT, 'submit-kit', 'preview', 'board-first-launch.png');

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))(name);
}

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * 把 `.ink` 的 `<script setup>` 抠出来，改写成可被 node 直接 import 的 ESM。
 *
 * 只做一件事：把 `from '../../lib/x.js'` 里的相对路径换成绝对 file:// URL。
 * 页面里的相对导入在 node 下会解析到临时目录，所以必须换。
 *
 * @param {string} [asrText] 若给了，就把语音识别**替换成固定返回这一句**。
 *   node 里没有麦克风、`import('wx')` 必然失败，语音路径在本地永远走不通；
 *   换成桩之后，「用户说完生辰 → 解析 → 排盘 → 关掉录入浮层」这条真路径
 *   才能在本地被跑到（这正是 2026-11-08 修的那个致命 bug 所在的那条路径）。
 */
async function loadPageModule(asrText = '') {
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

  // 语音识别桩：把 listenOnce 换成一个固定返回值的假函数，
  // 这样「确认键 → 听 → 解析 → 排盘 → 关浮层」整条路径能在本地跑通。
  if (asrText) {
    const before = body;
    body = body.replace(
      /import\s*\{\s*listenOnce\s*\}\s*from\s*'[^']*voice-input\.js';/,
      `const listenOnce = async () => ${JSON.stringify(asrText)};`,
    );
    if (body === before) {
      throw new Error('没能替换掉 listenOnce 导入 —— index.ink 的导入写法变了？');
    }
  }

  const tmp = path.join(os.tmpdir(), `ziwei-ink-setup-${process.pid}.mjs`);
  fs.writeFileSync(tmp, body, 'utf8');
  try {
    return await import(pathToFileURL(tmp).href);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * 最小 Ink 运行时。
 *
 * 页面用的是 `this.setData({...})` + `this.data.xxx` 这一套，
 * 所以只要把 data 做成可合并的对象、把 setData 挂上，其余逻辑一行都不用改。
 */
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

/** 等页面把异步排盘做完 */
async function waitReady(page, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (page.data.ready) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}

/** 等一个条件成立 */
async function waitFor(fn, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** 用真实 CSS + 真实页面数据渲染首屏 */
function renderHtml(page) {
  const ink = fs.readFileSync(INK_PAGE, 'utf8');
  const style = ink.slice(ink.indexOf('<style>') + 7, ink.indexOf('</style>'));

  const cellHtml = (page.data.cells || [])
    .map(
      (c) => `    <view class="cell p${c.branch} ${c.activeClass}">
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

  const center = page.data.center || {};
  const role = page.data.layerRole
    ? `        <text class="center-role">${esc(page.data.layerRole)}</text>`
    : '';

  const centerHtml = `    <view class="center">
      <text class="center-title">${esc(page.data.layerTitle)}</text>
      <text class="center-line">命主 ${esc(center.mingZhu)}　身主 ${esc(center.shenZhu)}</text>
      <text class="center-line dim">${esc(page.data.layerSub)}</text>
      <text class="center-line dim">${esc(page.data.layerExtra)}</text>
      <text class="center-line dim">${esc(center.pillarsText)}</text>
      <view class="center-divider"></view>
      <view class="selected-row">
        <text class="center-line strong">${esc(page.data.selectedName)}</text>
${role}
      </view>
      <text class="center-hint">${esc(page.data.navHint)}</text>
      <text class="center-hint dim">${esc(page.data.statusLine)}</text>
${
  page.data.demoLabel
    ? `      <text class="center-hint demo">${esc(page.data.demoLabel)}</text>`
    : ''
}
    </view>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<style>${style}
view, text, scroll-view { display: block; }
text { display: inline; }
page { display: block; }
html, body { margin: 0; padding: 0; background: #000; }
</style></head><body>
  <view class="board">
${cellHtml}
${centerHtml}
  </view>
</body></html>`;
}

async function main() {
  const queryArg = arg('--query', '');
  /**
   * 语音识别桩的返回文本（给了就跑完整条语音路径）。
   * 例：--asr "1990年1月1日 我不知道时辰 男"
   */
  const asrText = arg('--asr', '');
  const query = {};
  for (const pair of queryArg.split('&').filter(Boolean)) {
    const [k, v] = pair.split('=');
    if (k) query[k] = v;
  }
  const wantPng = !process.argv.includes('--no-png');

  // 冷启动：清掉本机命盘库，保证「首启」真的是首启，
  // 而不是被上一次跑测试时存进去的盘污染。
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ziwei.agent.profiles');
    }
  } catch (err) {
    /* 没有 localStorage 就算了，本来就是冷启动 */
  }

  const mod = await loadPageModule(asrText);
  const page = makePage(mod.default);

  await page.onLoad(query);
  const ready = await waitReady(page);

  const d = page.data;
  const problems = [];

  if (!ready) problems.push('页面在 8 秒内没有进入 ready 状态');
  if (!d.ready) problems.push('首屏没有排出来（ready=false）');
  if (!(d.cells || []).length) problems.push('盘面格子为空');
  else if (d.cells.length !== 12) problems.push(`盘面宫位数不是 12（是 ${d.cells.length}）`);
  if (d.overlay === 'input' && !d.cells.length) problems.push('页面仍停在「说出你的生辰」浮层');

  // 首启（无入参、无存档）必须是示例盘；带入参则不是
  const expectDemo = Object.keys(query).length === 0;
  if (expectDemo) {
    if (!d.demoLabel) problems.push('首启没有标注「示例盘」');
    if (d.sourceLabel !== '端侧计算') {
      problems.push(`端侧引擎没有真正加载（sourceLabel=${d.sourceLabel || '空'}）`);
    }
    if (!d.layersReady) problems.push('四层运限不可用（layersReady=false）');
    if (!d.statusLine || !d.statusLine.includes('端侧计算')) {
      problems.push(`中宫状态行不对（statusLine=${d.statusLine || '空'}）`);
    }
  } else if (d.demoLabel) {
    problems.push('带入参启动却仍被标成示例盘');
  }

  // 盘面态的返回键必须能回到生辰录入（重新说生辰的唯一入口）
  const overlayBefore = d.overlay;
  page.onKeyUp({ code: 'Backspace', preventDefault() {} });
  if (d.overlay !== 'input') {
    problems.push('盘面态按返回键没有回到生辰录入浮层');
  }
  const overlayAfterBack = d.overlay;

  /**
   * 语音路径（给了 --asr 才跑）：确认键 → 听 → 解析 → 排盘 → 关掉录入浮层。
   *
   * ⚠️ 这条路径以前**从没在本地跑到过**（模拟器没有麦克风，语音入口进不去），
   * 于是「解析成功后浮层没关」这个致命 bug 一直没人看见：
   * 用户说完生辰 → 排盘成功 → 录入浮层还盖在盘面上 →
   * 而浮层态按返回键是**退出应用** ⇒ 用户永远看不到自己刚排出来的盘。
   */
  let asrResult = null;
  if (asrText) {
    /**
     * 期望值由**解析器自己**算（不是写死「应该有估算标注」）——
     * 这样才能同时抓住两处不一致：解析器说估了但界面没标，或反之。
     */
    const parserMod = await import(
      pathToFileURL(path.join(AGENT_ROOT, 'lib', 'birth-parser.js')).href
    );
    const parsed = parserMod.parseBirthFromSpeech(asrText);
    const expectedNotice = parsed && parsed.hourEstimated ? '时辰按午时估算' : '';

    page.onKeyUp({ code: 'Enter', preventDefault() {} });
    await waitFor(() => page.data.overlay === '' && page.data.ready, 8000);
    asrResult = {
      overlay: page.data.overlay,
      notice: page.data.noticeLabel || '',
      cells: (page.data.cells || []).length,
      hour: parsed ? parsed.hour : null,
      expectedNotice,
    };
    if (page.data.overlay !== '') {
      problems.push('语音识别成功后录入浮层没有关掉 —— 用户看不到自己的盘');
    }
    if (!(page.data.cells || []).length) {
      problems.push('语音识别后排盘格子为空');
    }
    if (page.data.noticeLabel !== expectedNotice) {
      problems.push(
        `时辰估算标注与解析器不一致（界面=${page.data.noticeLabel || '空'}｜期望=${expectedNotice || '空'}）`,
      );
    }
  }

  console.log('── 本地首启模拟 ──────────────────────────────────────────');
  console.log(`  入参          : ${Object.keys(query).length ? JSON.stringify(query) : '（无）'}`);
  console.log(`  首屏状态      : ready=${d.ready}｜浮层=${overlayBefore || '（无）'}`);
  console.log(`  盘面          : ${(d.cells || []).length} 宫｜层=${d.layerTitle}｜选中=${d.selectedName}`);
  console.log(`  计算来源      : ${d.sourceLabel || '（空）'}`);
  console.log(`  运限层可用    : ${d.layersReady}`);
  console.log(`  示例盘标注    : ${d.demoLabel || '（无）'}`);
  console.log(`  返回键→生辰录入: ${overlayAfterBack === 'input' ? '可达 ✓' : '不可达 ✗'}`);
  if (asrResult) {
    console.log(`  语音识别      : 「${asrText}」`);
    console.log(`  解析时辰序号  : ${asrResult.hour}`);
    console.log(`  识别后浮层    : ${asrResult.overlay || '（无）'} ${asrResult.overlay === '' ? '✓ 已回到盘面' : '✗ 仍盖着'}`);
    console.log(`  识别后标注    : ${asrResult.notice || '（无）'}`);
    console.log(`  识别后宫位    : ${asrResult.cells}`);
  }
  console.log('──────────────────────────────────────────────────────────');

  if (wantPng) {
    // 重新跑一次渲染（返回键测试把页面切到了输入浮层）
    const page2 = makePage(mod.default);
    await page2.onLoad(query);
    await waitReady(page2);
    const html = renderHtml(page2);
    const tmpHtml = path.join(AGENT_ROOT, 'submit-kit', 'preview', 'board-first-launch.html');
    fs.mkdirSync(path.dirname(tmpHtml), { recursive: true });
    fs.writeFileSync(tmpHtml, html, 'utf8');

    const { chromium } = requireGlobal('playwright');
    const browser = await chromium.launch();
    try {
      const p = await browser.newPage({
        viewport: { width: 480, height: 352 },
        deviceScaleFactor: 3,
      });
      await p.goto(`file://${tmpHtml}`, { waitUntil: 'networkidle' });
      await p.screenshot({ path: OUT_PNG });
    } finally {
      await browser.close();
    }
    console.log(`✓ 首启画面 PNG：${OUT_PNG}`);
    console.log('  （模拟器渲染：真实页面逻辑 + 真实端侧引擎 + 真实 Ink 样式，不是真机照片）');
  }

  if (problems.length) {
    console.error('\n✗ 首启模拟未通过：');
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log('\n✓ 首启模拟通过：盘面、端侧引擎、四层运限、示例盘标注、返回键入口全部就位。');
}

main().catch((err) => {
  console.error('✗ 模拟失败：', err && err.stack ? err.stack : err);
  process.exit(1);
});
