#!/usr/bin/env node
/**
 * 眼镜端**交互链路**模拟 —— 逐条验证这一版交互真的成立。
 *
 * 商店审核驳回理由原文（v1.0.11）：
 *   「焦点切换问题 / arrow 滑动事件问题 无法切换 请检查 global hook 相关
 *     无法正常产生交互 请优化真机交互链路后提审」
 *
 * 这份驳回不是设备报障，是**交互链路设计错了**。所以本脚本的作用是：
 * 把「真机手势 → 键值序列 → 页面动作」这条链路的每一环都钉死，
 * 以后任何人改键位映射，都能立刻看到是不是又改回「一次滑动触发两个动作域」。
 *
 * ⚠️ **这一版验的是新的产品结构**（2026-11-12 重做）：
 *  · 屏幕形态从「一个页面 + 三个互斥整屏浮窗」改成「盘面页 / 对话页 / 录入页」；
 *  · 盘面页中宫从静态数据区改成**常驻对话摘要**；
 *  · 新增**会话流**（多轮问答都在屏幕上），对话页顶部保留盘面缩略带；
 *  · 提问从「只能选预设」改成**可以开口说话**（也能用建议语兜底）；
 *  · 手势重排：**每个手势在每屏只有一个含义**。
 *
 * 它不需要 Rokid 账号、不需要 AIUI Studio、不需要后端
 * —— 跟首启模拟器一样，直接把 `.ink` 的 `<script setup>` 当 ESM 加载，
 * 配一个最小 Ink 运行时（setData / data / finish），
 * 并把**网络与语音**换成桩，保证测的是交互契约而不是网络。
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
 *
 * 改写三处：
 *  1. 相对导入 → 绝对 file:// URL（node 下相对路径会解析到临时目录）；
 *  2. `lib/api.js` → 桩（测交互不该等真网络，更不该被网络抖动带偏）；
 *  3. `lib/voice-input.js` → 桩（真机上没有麦克风，桩还能**指定**识别结果）。
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

    /* 后端桩：解读与追问都走内存，返回结构与真实接口一致 */
    body = body.replace(
        /import\s*\{[^}]*\}\s*from\s*'[^']*api\.js';/,
        [
            'const requestReading = async () => globalThis.__stubReading;',
            'const requestAsk = async (b, q, t, f) => globalThis.__stubAsk(b, q, t, f);'
        ].join('\n'),
    );

    /* 语音桩：__stubSpeech 决定「用户说了什么」 */
    body = body.replace(
        /import\s*\{[^}]*\}\s*from\s*'[^']*voice-input\.js';/,
        [
            'const __say = async (opts) => {',
            '    const text = globalThis.__stubSpeech || "";',
            '    if (opts && typeof opts.onPartial === "function") opts.onPartial(text);',
            '    return text;',
            '};',
            'const listenOnce = __say;',
            'const listenContinuous = __say;',
            'const cancelListen = () => {};'
        ].join('\n'),
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

/* ---- 桩数据 ---- */
globalThis.__stubReading = {
    status: 'ok',
    dimensions: [
        { key: 'overview', label: '命格总览', text: '这是一段来自数据集的解读原文。' },
        { key: 'career', label: '事业', text: '这是一段关于事业的解读原文。' }
    ],
    citationModeLabel: '引文正常'
};
globalThis.__stubAsk = async (birth, question) => ({
    answer: `这是模型回答：${question}`,
    cited: [],
    verification: '',
    model: 'test-model',
    citationModeLabel: '引文正常'
});
globalThis.__stubSpeech = '';

const mod = await loadPageModule();
const page = makePage(mod.default);

console.log('\n── 眼镜端交互链路模拟（对话版） ──');

/* ---- 0. 首启出盘 ---- */
await page.onLoad({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
const ready = await waitFor(() => page.data.ready);
assert('首屏出盘', ready && page.data.cells.length === 12, `ready=${page.data.ready}`);
assert('端侧引擎加载（四层运限可用）', page.data.layersReady === true, `layersReady=${page.data.layersReady}`);
assert('首屏停在盘面页', page.data.screen === 'board', `screen=${page.data.screen}`);
assert(
    '中宫给出焦点行（哪一宫、哪一层）',
    typeof page.data.focusLine === 'string' && page.data.focusLine.length > 0,
    `focusLine=${page.data.focusLine}`
);

/* ---- 1. 滑动 = 选宫，一次只走一档 ---- */
const b0 = page.data.selectedBranch;
await swipe(page, 'ArrowRight', 'ArrowDown');
const b1 = page.data.selectedBranch;
assert('真机前滑（Right+Down）只走一档', b1 === (b0 + 1) % 12, `${b0} → ${b1}`);
assert('前滑没有同时切层', page.data.layerKey === 'natal', `layerKey=${page.data.layerKey}`);
assert('前滑没有跳去别的屏', page.data.screen === 'board', `screen=${page.data.screen}`);

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
    `${b3} → ${page.data.selectedBranch}`
);

/* ---- 3. 中宫焦点行跟着选宫走 ---- */
assert(
    '中宫焦点行跟着选中的宫变',
    typeof page.data.focusLine === 'string' && page.data.focusLine.startsWith(page.data.selectedName),
    `focusLine=${page.data.focusLine} selected=${page.data.selectedName}`
);

/* ---- 4. 双击 = 切时间层（盘面页） ---- */
await sleep(400);
await doubleTap(page);
assert('盘面页双击切了时间层', page.data.layerKey !== 'natal', `layerKey=${page.data.layerKey}`);
assert('盘面页双击没有跳去对话页', page.data.screen === 'board', `screen=${page.data.screen}`);
await doubleTap(page);
assert('盘面页双击可以继续切层', page.data.layerKey !== 'natal', `layerKey=${page.data.layerKey}`);
await sleep(1200); // 等切层的语音播报结束

/* ---- 5. 返回键 = 退出应用（盘面页） ---- */
await sleep(250);
tap(page, 'Backspace');
await sleep(50);
assert('盘面页返回键退出应用', page._finished === true, '_finished 未置位');
/** 退出后重开一个页面实例继续测（finish 之后状态不该再被测） */
const page2 = makePage(mod.default);
await page2.onLoad({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
await waitFor(() => page2.data.ready);

/* ---- 6. 单击 = 问这一宫 → 进对话页，回答进会话流 ---- */
await sleep(400);
await singleTap(page2);
const inChat = await waitFor(() => page2.data.screen === 'chat');
assert('盘面页单击进了对话页', inChat, `screen=${page2.data.screen}`);
assert(
    '对话页顶部的盘面缩略带常驻（12 格）',
    Array.isArray(page2.data.stripCells) && page2.data.stripCells.length === 12,
    `stripCells=${(page2.data.stripCells || []).length}`
);
assert(
    '缩略带高亮了当前宫',
    (page2.data.stripCells || []).some((c) => c.activeClass === 'on'),
    '没有高亮项'
);
const gotAnswer = await waitFor(() => page2.data.chatTurns.length > 0 && !page2.data.chatTurns[0].pending);
assert('单击后有一问一答进会话流', gotAnswer, JSON.stringify(page2.data.chatTurns));
assert(
    '会话流里能看到用户问的那一句',
    (page2.data.chatTurns[0] || {}).q && page2.data.chatTurns[0].q.length > 0,
    JSON.stringify((page2.data.chatTurns[0] || {}).q)
);
assert(
    '回答来源有标注（原文/推演）',
    ['原文', '推演'].includes((page2.data.chatTurns[0] || {}).sourceLabel),
    `sourceLabel=${(page2.data.chatTurns[0] || {}).sourceLabel}`
);

/* ---- 7. 盘面页中宫显示最近一问一答（对话面常驻） ---- */
assert('中宫摘要有最近一问', !!page2.data.digestQuestion, `digest=${page2.data.digestQuestion}`);
assert('中宫摘要有最近一答', !!page2.data.digestAnswer, `digest=${page2.data.digestAnswer}`);

/* ---- 8. 对话页：返回回盘面（不退出应用） ---- */
await sleep(300);
tap(page2, 'Backspace');
await sleep(50);
assert('对话页返回键回盘面', page2.data.screen === 'board', `screen=${page2.data.screen}`);
assert('对话页返回键没有退出应用', !page2._finished, '_finished 被置位');
assert('回盘面后摘要还在（对话面常驻）', !!page2.data.digestQuestion, `digest=${page2.data.digestQuestion}`);

/* ---- 9. 对话页：双击 = 问建议语（不依赖语音识别的兜底路径） ---- */
await singleTap(page2);
await waitFor(() => page2.data.screen === 'chat');
await sleep(400);
const turnsBefore = page2.data.chatTurns.length;
await doubleTap(page2);
const asked = await waitFor(
    () => page2.data.chatTurns.length > turnsBefore && !page2.data.chatTurns[page2.data.chatTurns.length - 1].pending
);
assert('对话页双击用建议语发问', asked, JSON.stringify(page2.data.chatTurns));
const lastTurn = page2.data.chatTurns[page2.data.chatTurns.length - 1] || {};
assert('建议语那一轮标记为「推演」', lastTurn.sourceLabel === '推演', `sourceLabel=${lastTurn.sourceLabel}`);

/* ---- 10. 对话页：单击 = 开口说话 ---- */
globalThis.__stubSpeech = '我今年事业上要注意什么';
await singleTap(page2);
const spoken = await waitFor(() => {
    const turns = page2.data.chatTurns || [];
    const last = turns[turns.length - 1] || {};
    return last.q === '我今年事业上要注意什么' && !last.pending;
});
assert('对话页单击把说的话变成一轮问答', spoken, JSON.stringify(page2.data.chatTurns));
assert(
    '语音识别到的问题进了会话流',
    (page2.data.chatTurns[page2.data.chatTurns.length - 1] || {}).q === '我今年事业上要注意什么',
    JSON.stringify((page2.data.chatTurns[page2.data.chatTurns.length - 1] || {}).q)
);

/* ---- 11. 说的是生辰 → 换盘（换生辰走语音，不占手势） ---- */
globalThis.__stubSpeech = '1990年1月1日 早上 男';
await singleTap(page2);
const reCharted = await waitFor(() => page2.data.screen === 'board' && page2.data.ready);
assert('语音说的是生辰 → 重新排盘', reCharted, `screen=${page2.data.screen}`);
assert('换盘后回到盘面页', page2.data.screen === 'board', `screen=${page2.data.screen}`);
assert('换盘后会话流清空', page2.data.chatTurns.length === 0, `turns=${page2.data.chatTurns.length}`);
assert('换盘后中宫摘要清空', !page2.data.digestQuestion, `digest=${page2.data.digestQuestion}`);

/* ---- 12. 关闭对话页后，迟到的回答不得落地 ---- */
globalThis.__stubSpeech = '这个问题要等很久';
globalThis.__stubAsk = async () => {
    await sleep(400);
    return { answer: '这是一条迟到的回答', cited: [], verification: '', model: 'test-model' };
};
/** 进对话页（盘面页单击 = 问这一宫，先落一轮解读） */
await singleTap(page2);
await waitFor(() => page2.data.screen === 'chat');
await waitFor(() => (page2.data.chatTurns || []).every((t) => !t.pending));
/** 对话页单击 = 开口说话 → 走 ask（桩是慢的） */
await singleTap(page2);
const sawPending = await waitFor(() => (page2.data.chatTurns || []).some((t) => t.pending));
assert('等待中的那一轮是 pending', sawPending, JSON.stringify(page2.data.chatTurns));
const seqBefore = page2._askSeq;
/** 立刻回盘面（作废代际），再让回答回来 */
tap(page2, 'Backspace');
await sleep(700);
assert(
    '关掉对话页后迟到的回答没有落地',
    !page2.data.chatTurns.some((t) => t.answer === '这是一条迟到的回答'),
    JSON.stringify(page2.data.chatTurns)
);
assert('关掉对话页后代际令牌递增', page2._askSeq > seqBefore, `seq=${page2._askSeq}`);
globalThis.__stubAsk = async (birth, question) => ({
    answer: `这是模型回答：${question}`,
    cited: [],
    verification: '',
    model: 'test-model',
    citationModeLabel: '引文正常'
});

/* ---- 13. 首启 demo 盘：单击 = 开口说话，不问解读 ---- */
const page3 = makePage(mod.default);
await page3.onLoad({});
const ready3 = await waitFor(() => page3.data.ready);
assert('无生辰时出示例盘', ready3 && page3.data.cells.length === 12, `ready=${page3.data.ready}`);
assert('示例盘有标注', !!page3.data.demoLabel, `demoLabel=${page3.data.demoLabel}`);
await sleep(300);
globalThis.__stubSpeech = '1990年1月1日 早上 男';
await singleTap(page3);
const reCharted3 = await waitFor(() => page3.data.screen === 'board' && page3.data.demoLabel === '');
assert('示例盘单击开口说话 → 说完生辰就换盘', reCharted3, `screen=${page3.data.screen} demo=${page3.data.demoLabel}`);
assert(
    '示例盘上不产生解读请求（不拿别人的盘回答用户）',
    (page3.data.chatTurns || []).length === 0,
    `turns=${(page3.data.chatTurns || []).length}`
);

console.log(`\n通过 ${passed} / 失败 ${failed}`);
process.exit(failed ? 1 : 0);
