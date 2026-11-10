#!/usr/bin/env node
/**
 * 眼镜端**交互链路**模拟 —— 逐条验证评审驳回的那几个问题真的修好了。
 *
 * 商店审核驳回理由原文（v1.0.11）：
 *   「焦点切换问题 / arrow 滑动事件问题 无法切换 请检查 global hook 相关
 *     无法正常产生交互 请优化真机交互链路后提审」
 *
 * 这份驳回不是设备报障，是**交互链路设计错了**。所以本脚本的作用是：
 * 把「真机手势 → 键值序列 → 页面动作」这条链路的每一环都钉死，
 * 以后任何人改键位映射，都能立刻看到是不是又改回「一次滑动触发两个动作域」。
 *
 * 它与 `simulate-first-launch.mjs` 的分工：
 *   · `simulate-first-launch` 验证**首屏**（出盘、端侧引擎、示例盘标注）；
 *   · 本脚本验证**交互**（选宫 / 翻页 / 切层 / 浮层开关 / 返回语义）。
 *
 * 它不需要 Rokid 账号、不需要 AIUI Studio、不需要后端
 * —— 跟首启模拟器一样，直接把 `.ink` 的 `<script setup>` 当 ESM 加载，
 * 配一个最小 Ink 运行时（setData / data / finish）。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/simulate-interaction-chain.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_ROOT } from './forbidden-terms.mjs';

const INK_PAGE = path.join(AGENT_ROOT, 'pages', 'index', 'index.ink');

let passed = 0;
let failed = 0;

function assert(name, cond, detail) {
    if (cond) {
        passed++;
        console.log(`  ✓ ${name}`);
    } else {
        failed++;
        console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
}

/**
 * 把 `.ink` 的 `<script setup>` 抠出来，改写成可被 node 直接 import 的 ESM。
 * 只做一件事：把相对导入换成绝对 file:// URL（node 下相对路径会解析到临时目录）。
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

    const tmp = path.join(os.tmpdir(), `ziwei-ink-chain-${process.pid}.mjs`);
    fs.writeFileSync(tmp, body, 'utf8');
    try {
        return await import(pathToFileURL(tmp).href);
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

/** 最小 Ink 运行时：页面只用 `this.setData({...})` + `this.data.xxx` */
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 宿主派发一次物理按键（keydown + keyup） */
function tap(page, code) {
    page.onKeyDown({ code, preventDefault() {} });
    page.onKeyUp({ code, preventDefault() {} });
}

/**
 * 真机滑动：GlobalHook 先到，约 60ms 后来**一对**方向键。
 *
 * 真机实测（言值项目，已上架 Rokid 商店）：
 *   前滑 = `ArrowRight` + `ArrowDown`，后滑 = `ArrowLeft` + `ArrowUp`。
 */
async function swipe(page, first, second) {
    tap(page, 'GlobalHook');
    await sleep(60);
    tap(page, first);
    await sleep(20);
    tap(page, second);
    await sleep(20);
}

/** 真机单击：GlobalHook → 550~600ms → 补发 Enter */
async function singleTap(page) {
    tap(page, 'GlobalHook');
    await sleep(600);
    tap(page, 'Enter');
    await sleep(60);
}

/** 真机双击：GlobalHook ×2（约 120ms 间隔）→ 补发 Backspace */
async function doubleTap(page) {
    tap(page, 'GlobalHook');
    await sleep(120);
    tap(page, 'GlobalHook');
    await sleep(120);
    tap(page, 'Backspace');
    await sleep(60);
}

async function waitFor(pred, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (pred()) return true;
        await sleep(30);
    }
    return false;
}

const mod = await loadPageModule();
const page = makePage(mod.default);

console.log('\n── 眼镜端交互链路模拟 ──');

// 首启出盘
await page.onLoad({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
const ready = await waitFor(() => page.data.ready);
assert('首屏出盘', ready && page.data.cells.length === 12, `ready=${page.data.ready}`);
assert('端侧引擎加载（四层运限可用）', page.data.layersReady === true, `layersReady=${page.data.layersReady}`);

/* ---- 1. 滑动 = 选宫，一次只走一档 ---- */
const b0 = page.data.selectedBranch;
await swipe(page, 'ArrowRight', 'ArrowDown');
const b1 = page.data.selectedBranch;
assert('真机前滑（Right+Down）只走一档', b1 === (b0 + 1) % 12, `${b0} → ${b1}`);
assert('前滑没有同时切层', page.data.layerKey === 'natal', `layerKey=${page.data.layerKey}`);
assert('前滑没有打开浮层', page.data.overlay === '', `overlay=${page.data.overlay}`);

await swipe(page, 'ArrowLeft', 'ArrowUp');
assert('真机后滑（Left+Up）只走一档', page.data.selectedBranch === b0, `→ ${page.data.selectedBranch}`);

/* ---- 2. 模拟器滑动（只有一个方向键）也要走一档 ---- */
await sleep(250); // 抖动窗口（150ms）内同键连按会被当回声，这里先拉开
const b3 = page.data.selectedBranch;
tap(page, 'GlobalHook');
await sleep(30);
tap(page, 'ArrowUp');
await sleep(30);
assert(
    '模拟器滑动（单个方向键）只走一档',
    page.data.selectedBranch === (b3 - 1 + 12) % 12,
    `${b3} → ${page.data.selectedBranch}`,
);

/* ---- 3. 双击 = 切时间层，且不误确认 ---- */
await sleep(400);
await doubleTap(page);
assert('双击切了时间层', page.data.layerKey !== 'natal', `layerKey=${page.data.layerKey}`);
assert('双击没有误开解读浮层', page.data.overlay === '', `overlay=${page.data.overlay}`);
await doubleTap(page);
assert('双击可以继续切层', page.data.layerKey !== 'natal', `layerKey=${page.data.layerKey}`);

/* ---- 4. 单击 = 打开解读，且只开一次 ---- */
await sleep(1200);
await singleTap(page);
assert('单击打开解读浮层', page.data.overlay === 'reading', `overlay=${page.data.overlay}`);

/* ---- 5. 解读浮层里滑动 = 翻文本 ---- */
const top0 = page.data.readingScrollTop;
tap(page, 'GlobalHook');
await sleep(30);
tap(page, 'ArrowRight');
await sleep(50);
assert('解读浮层里滑动 = 往下翻', page.data.readingScrollTop > top0, `${top0} → ${page.data.readingScrollTop}`);
tap(page, 'GlobalHook');
await sleep(30);
tap(page, 'ArrowLeft');
await sleep(50);
assert('解读浮层里滑动 = 往上翻', page.data.readingScrollTop === top0, `→ ${page.data.readingScrollTop}`);

/* ---- 6. 解读浮层里双击 = 关闭浮层，不退出应用 ---- */
await doubleTap(page);
assert('解读浮层里双击关闭浮层', page.data.overlay === '', `overlay=${page.data.overlay}`);
assert('没有退出应用', !page._finished, '_finished 被置位');

/* ---- 7. 追问浮层：滑动翻答案、双击换问题 ---- */
await sleep(1200);
await singleTap(page);
assert('单击打开解读浮层', page.data.overlay === 'reading', `overlay=${page.data.overlay}`);
await sleep(1200);
await singleTap(page);
assert('解读浮层里单击打开追问浮层', page.data.overlay === 'ask', `overlay=${page.data.overlay}`);
const q0 = page.data.askQuestion;
await doubleTap(page);
assert('追问浮层里双击换预设问题', page.data.askQuestion !== q0, `${q0} → ${page.data.askQuestion}`);
const a0 = page.data.askScrollTop;
tap(page, 'GlobalHook');
await sleep(30);
tap(page, 'ArrowRight');
await sleep(50);
assert('追问浮层里滑动 = 翻答案', page.data.askScrollTop > a0, `${a0} → ${page.data.askScrollTop}`);

/* ---- 8. 追问浮层里单击 = 发送追问 ---- */
await singleTap(page);
/** 本地没有后端，请求会立刻失败 —— 所以判据是「askAnswer 有内容」，不是 askLoading */
await waitFor(() => page.data.askLoading === false, 40000).catch(() => {});
assert(
    '追问浮层里单击触发发送',
    page.data.askLoading === true || page.data.askAnswer !== '',
    `askLoading=${page.data.askLoading}`,
);

/* ---- 9. 返回键：浮层态只关浮层，不退出应用 ---- */
await sleep(250); // 抖动窗口（150ms）内同键连按会被当回声，这里先拉开
tap(page, 'Backspace');
await sleep(50);
assert('返回键关闭追问浮层', page.data.overlay === '', `overlay=${page.data.overlay}`);
assert('返回键没有退出应用', !page._finished, '_finished 被置位');

/* ---- 10. 盘面态返回键 = 重新说生辰（不是退出应用） ---- */
await sleep(250);
tap(page, 'Backspace');
await sleep(50);
assert('盘面态返回键回到生辰录入', page.data.overlay === 'input', `overlay=${page.data.overlay}`);
assert('盘面态返回键没有退出应用', !page._finished, '_finished 被置位');

console.log(`\n通过 ${passed} / 失败 ${failed}`);
process.exit(failed ? 1 : 0);
