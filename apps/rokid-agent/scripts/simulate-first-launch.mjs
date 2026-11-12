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
 *  1. **首启必须出盘**（无入参、无本机存档 → 内置示例盘），停在盘面页，不再停在「说出你的生辰」；
 *  2. **端侧引擎真的能加载**（assets/engine.js 动态 import）→ 中宫显示「端侧计算」；
 *  3. **四层运限可用**（layersReady）；
 *  4. **示例盘标注在界面上**，且不会写进本机命盘库；
 *  5. **中宫是对话区**（focusLine + digestLead 都有内容）；
 *  6. **盘面态的返回键能退出应用**（换生辰走语音，不占手势）；
 *  7. **语音路径**（给了 --asr 才跑）：单击 → 听 → 解析 → 排盘 → **回到盘面页**，
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
import {
  readStyle,
  renderBoardHtml,
  renderChatHtml as renderChatPageHtml
} from './preview-html.mjs';

const REPO = path.resolve(AGENT_ROOT, '..', '..');
const INK_PAGE = path.join(AGENT_ROOT, 'pages', 'index', 'index.ink');
const OUT_PNG = path.join(AGENT_ROOT, 'submit-kit', 'preview', 'board-first-launch.png');
const OUT_CHAT_PNG = path.join(AGENT_ROOT, 'submit-kit', 'preview', 'chat-conversation.png');

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

  // 语音识别桩：把 listenOnce / listenContinuous 换成固定返回值的假函数，
  // 这样「单击 → 听 → 解析 → 排盘」整条路径能在本地跑通。
  if (asrText) {
    const before = body;
    body = body.replace(
      /import\s*\{[^}]*\}\s*from\s*'[^']*voice-input\.js';/,
      [
        `const __say = async () => ${JSON.stringify(asrText)};`,
        'const listenOnce = __say;',
        'const listenContinuous = __say;',
        'const cancelListen = () => {};'
      ].join('\n')
    );
    if (body === before) {
      throw new Error('没能替换掉 voice-input 导入 —— index.ink 的导入写法变了？');
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

/**
 * 用真实 CSS + 真实页面数据渲染盘面页。
 *
 * ⚠️ HTML 的生成在 `scripts/preview-html.mjs`（与提审预览视频共用）——
 * 页面模板一改，两边必须一起变，各写一份就会漂移成「文档里的界面」。
 */
function renderHtml(page) {
  return renderBoardHtml(page.data, readStyle());
}

/**
 * 渲染对话页。
 *
 * ⚠️ 为什么单独渲染一张：这一版最要紧的改动是「把对话面做出来」，
 * 而对话页是**从来没被渲染过**的一屏 —— 之前的版本没有这一屏。
 * 不渲染出来，就没法知道它是不是真的能用（48px 的缩略带 + 会话流 + 页脚，
 * 三个区域加起来必须正好 352px）。
 */
function renderChatHtml(page) {
  return renderChatPageHtml(page.data, readStyle());
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
  if (d.screen === 'input' && !d.cells.length) problems.push('页面仍停在「说出你的生辰」页');

  /**
   * 首启必须停在**盘面页** —— 这一版的盘面页中宫就是对话区，
   * 用户第一眼看到的是「能跟我说话」，而不是一张陌生的图。
   */
  if (d.screen !== 'board') problems.push(`首启不在盘面页（screen=${d.screen}）`);

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
    if (!d.digestLead) problems.push('中宫没有对话引导语（digestLead 为空）');
  } else if (d.demoLabel) {
    problems.push('带入参启动却仍被标成示例盘');
  }

  /**
   * 盘面态的返回键 = **退出应用**。
   *
   * ⚠️ 之前返回键承担的是「重新说生辰」，用户想退出退不掉，
   * 而且一按就把自己排好的盘抹掉。现在退出归返回键，
   * 换生辰走**语音**（对话页开口，说的是生辰就重排）。
   */
  page.onKeyUp({ code: 'Backspace', preventDefault() {} });
  const exitedByBackspace = page._finished === true;
  if (!exitedByBackspace) {
    problems.push('盘面态按返回键没有退出应用');
  }

  /**
   * 语音路径（给了 --asr 才跑）：单击 → 听 → 解析 → 排盘 → 回到盘面页。
   *
   * ⚠️ 这条路径以前**从没在本地跑到过**（模拟器没有麦克风，语音入口进不去），
   * 于是「解析成功后浮层没关」这个致命 bug 一直没人看见。
   * 现在示例盘上单击就是开口，这条路径是**首启换盘的主路径**。
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

    /** 示例盘上单击 = 开口说话 */
    page.onKeyUp({ code: 'Enter', preventDefault() {} });
    await waitFor(() => page.data.ready && page.data.demoLabel === '', 8000);
    asrResult = {
      screen: page.data.screen,
      notice: page.data.noticeLabel || '',
      cells: (page.data.cells || []).length,
      hour: parsed ? parsed.hour : null,
      expectedNotice
    };
    if (page.data.screen !== 'board') {
      problems.push('语音识别成功后没有回到盘面页 —— 用户看不到自己的盘');
    }
    if (page.data.demoLabel) {
      problems.push('语音识别成功后仍然是示例盘 —— 生辰没有被采纳');
    }
    if (!(page.data.cells || []).length) {
      problems.push('语音识别后排盘格子为空');
    }
    if (page.data.noticeLabel !== expectedNotice) {
      problems.push(
        `时辰估算标注与解析器不一致（界面=${page.data.noticeLabel || '空'}｜期望=${expectedNotice || '空'}）`
      );
    }
  }

  console.log('── 本地首启模拟 ──────────────────────────────────────────');
  console.log(`  入参          : ${Object.keys(query).length ? JSON.stringify(query) : '（无）'}`);
  console.log(`  首屏状态      : ready=${d.ready}｜屏=${d.screen}`);
  console.log(`  盘面          : ${(d.cells || []).length} 宫｜层=${d.layerTitle}｜选中=${d.selectedName}`);
  console.log(`  中宫焦点      : ${d.focusLine || '（空）'}`);
  console.log(`  中宫详情      : ${d.focusDetail || '（空）'}`);
  console.log(`  中宫引导      : ${d.digestLead || '（空）'}`);
  console.log(`  计算来源      : ${d.sourceLabel || '（空）'}`);
  console.log(`  运限层可用    : ${d.layersReady}`);
  console.log(`  示例盘标注    : ${d.demoLabel || '（无）'}`);
  console.log(`  返回键→退出  : ${exitedByBackspace ? '可达 ✓' : '不可达 ✗'}`);
  if (asrResult) {
    console.log(`  语音识别      : 「${asrText}」`);
    console.log(`  解析时辰序号  : ${asrResult.hour}`);
    console.log(`  识别后屏      : ${asrResult.screen} ${asrResult.screen === 'board' ? '✓ 已回盘面' : '✗'}`);
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

      /* 对话页预览：这一版最要紧的一屏，必须看得见 */
      const chatPage = makePage(mod.default);
      await chatPage.onLoad(
        Object.keys(query).length ? query : { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' }
      );
      await waitReady(chatPage);
      /**
       * ⚠️ 要写 `_turns`（真源），不能只 setData `chatTurns` ——
       * `_syncChat()` 会用 `_turns` 重算视图模型，
       * 直接 setData 的内容会被它覆盖掉（空态就是这么来的）。
       */
      chatPage._turns = [
        {
          id: 't1',
          question: '命宫，今年怎么样？',
          kind: 'reading',
          focus: '本命命宫 · 命格总览',
          answer:
            '这是一段来自数据集的解读原文：主星天机化禄，思虑细腻、擅长在变化里找机会。',
          citation: '引文正常',
          pending: false,
          failed: false
        },
        {
          id: 't2',
          question: '我今年事业上要注意什么',
          kind: 'ask',
          focus: '焦点：命宫 · 流年',
          answer:
            '这一年适合把手上的一件事做深，不适合同时开三摊。流年四化里，你的位置是「权」，意思是主导权在自己手上，但要靠专业度撑住。',
          citation: '引文正常',
          pending: false,
          failed: false
        }
      ];
      chatPage.setData({
        screen: 'chat',
        hintLine: '滑动翻会话　单击开口问　双击问建议语',
        statusLine: '端侧计算'
      });
      chatPage._syncChat();
      const chatHtml = renderChatHtml(chatPage);
      const tmpChatHtml = path.join(AGENT_ROOT, 'submit-kit', 'preview', 'chat-conversation.html');
      fs.writeFileSync(tmpChatHtml, chatHtml, 'utf8');
      const p2 = await browser.newPage({
        viewport: { width: 480, height: 352 },
        deviceScaleFactor: 3,
      });
      await p2.goto(`file://${tmpChatHtml}`, { waitUntil: 'networkidle' });
      await p2.screenshot({ path: OUT_CHAT_PNG });
    } finally {
      await browser.close();
    }
    console.log(`✓ 首启画面 PNG：${OUT_PNG}`);
    console.log(`✓ 对话页 PNG  ：${OUT_CHAT_PNG}`);
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
