#!/usr/bin/env node
/**
 * **真包 + 真后端**全链路测试 —— 这是「不是模拟器」的那种测法。
 *
 * 现有模拟器把 `lib/api.js` 整个换成内存桩（`__stubReading` / `__stubAsk`），
 * 所以它证明的是「交互契约没写错」，**不是「眼镜上真的能问出东西」**。
 *
 * 本脚本测的是后者：
 *   · 被测代码 = **云端当前发布包**解出来的 `pages/index/index.ink` + `lib/*.js`
 *     （不是仓库源码 —— 仓库已经比发布包领先 14 行免责声明）；
 *   · 后端 = **真** `lib/api.js` → 真 HTTPS → `https://ziwei.secondplanet.cc`
 *   · 只有「麦克风」是桩（node 里没有麦克风，这一层在本地永远走不通）；
 *   · 端侧排盘引擎 = 真（`assets/engine.js`，node 里能跑）。
 *
 * 另外它给 `globalThis.fetch` 套了一层探针 ——
 * 真实请求的 URL / 体积 / 耗时 / 结果全部打出来，
 * 这样「界面卡住」能被定位到**具体是哪一个 HTTP 请求**，而不是笼统地说「没反应」。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/test-real-backend-e2e.mjs
 *   node apps/rokid-agent/scripts/test-real-backend-e2e.mjs --pkg <aix 路径>
 *   node apps/rokid-agent/scripts/test-real-backend-e2e.mjs --repo
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AGENT_ROOT } from './forbidden-terms.mjs';

const DEFAULT_PKG = path.join(
    AGENT_ROOT,
    'submit-kit',
    'aix',
    'bcdceff1163f4e6e8dea474d03b5f0c9-1794538212787.aix'
);

const argv = process.argv.slice(2);
const argOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
};
const useRepo = argv.includes('--repo');
const pkgPath = argOf('--pkg') || DEFAULT_PKG;

/* ------------------------------------------------------------------ *
 * 1. 取被测代码
 * ------------------------------------------------------------------ */
let sourceRoot;
let sourceLabel;
let tmpDir;

if (useRepo) {
    sourceRoot = AGENT_ROOT;
    sourceLabel = '仓库源码（apps/rokid-agent/）';
} else {
    if (!fs.existsSync(pkgPath)) {
        console.error(`✗ 找不到发布包：${pkgPath}\n  用 --repo 或 --pkg 指定。`);
        process.exit(2);
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-e2e-'));
    execFileSync('unzip', ['-q', pkgPath, '-d', path.join(tmpDir, 'pkg')], { stdio: 'ignore' });
    sourceRoot = path.join(tmpDir, 'pkg');
    sourceLabel = `发布包 ${path.basename(pkgPath)}`;
}

const INK_PAGE = path.join(sourceRoot, 'pages', 'index', 'index.ink');
const LIB_DIR = path.join(sourceRoot, 'lib');

/* ------------------------------------------------------------------ *
 * 2. fetch 探针：把真实请求的来龙去脉打出来
 * ------------------------------------------------------------------ */
const realFetch = globalThis.fetch;
globalThis.fetch = async function probedFetch(url, init) {
    const body = (init && init.body) || '';
    const t0 = Date.now();
    console.log(`      → POST ${String(url).replace(/^https?:\/\//, '')}　${body.length}B`);
    try {
        const res = await realFetch(url, init);
        console.log(`      ← HTTP ${res.status}　${Date.now() - t0}ms`);
        return res;
    } catch (err) {
        console.log(`      ✗ 失败 ${Date.now() - t0}ms　${err && err.name}: ${err && err.message}`);
        throw err;
    }
};

/* ------------------------------------------------------------------ *
 * 3. 加载页面：只桩麦克风，后端 / 引擎 / 存储全是真代码
 * ------------------------------------------------------------------ */
async function loadPageModule() {
    const ink = fs.readFileSync(INK_PAGE, 'utf8');
    const start = ink.indexOf('<script setup>');
    const end = ink.indexOf('</script>', start);
    if (start < 0 || end < 0) throw new Error('index.ink 里找不到 <script setup> 块');

    let body = ink.slice(start + '<script setup>'.length, end);

    /* 只有 voice-input 是桩（node 没麦克风）；api.js / chart-source.js 走真文件 */
    body = body.replace(
        /from\s+'\.\.\/\.\.\/lib\/([^']+)'/g,
        (_m, rel) =>
            rel === 'voice-input.js'
                ? `from '${rel}'`
                : `from '${pathToFileURL(path.join(LIB_DIR, rel)).href}'`
    );

    const voiceImportRe = /import\s*\{([^}]*)\}\s*from\s*'voice-input\.js';/;
    const matched = body.match(voiceImportRe);
    if (!matched) throw new Error('没能找到 voice-input 导入 —— index.ink 的导入写法变了？');
    const names = matched[1]
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
    const stubs = {
        listenOnce: 'const listenOnce = __say;',
        listenContinuous: 'const listenContinuous = __say;',
        cancelListen: 'const cancelListen = () => {};',
        withTimeout: 'const withTimeout = async (p) => p;',
        VOICE_HARD_TIMEOUT: 'const VOICE_HARD_TIMEOUT = 14000;'
    };
    const unknown = names.filter((n) => !(n in stubs));
    if (unknown.length) throw new Error(`voice-input 的新导出没有桩：${unknown.join('、')}`);
    body = body.replace(
        voiceImportRe,
        [
            'const __say = async (opts) => {',
            '    const text = globalThis.__stubSpeech || "";',
            '    if (opts && typeof opts.onPartial === "function") opts.onPartial(text);',
            '    return text;',
            '};',
            ...names.map((n) => stubs[n])
        ].join('\n')
    );

    const tmp = path.join(tmpDir || os.tmpdir(), `ziwei-e2e-setup-${process.pid}.mjs`);
    fs.writeFileSync(tmp, body, 'utf8');
    try {
        return await import(pathToFileURL(tmp).href);
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

function makePage(def) {
    const page = Object.create(def);
    page.data = JSON.parse(JSON.stringify(def.data || {}));
    page.setData = function setData(patch) {
        Object.assign(this.data, patch || {});
    };
    page.finish = function finish() {
        this._finished = true;
    };
    page.__actions = [];
    const orig = def._dispatchKey;
    page._dispatchKey = function _dispatchKey(action) {
        page.__actions.push(action);
        return orig.call(this, action);
    };
    return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tap(page, code) {
    page.onKeyDown({ code, preventDefault() {} });
    page.onKeyUp({ code, preventDefault() {} });
}

/** 最后一轮对话是否已经落地（pending=false） */
function lastTurnSettled(page) {
    const turns = page.data.chatTurns || [];
    const last = turns[turns.length - 1];
    return Boolean(last && last.pending === false);
}

async function waitSettled(page, timeoutMs, onTick) {
    const deadline = Date.now() + timeoutMs;
    let tickAt = 0;
    while (Date.now() < deadline) {
        if (lastTurnSettled(page)) return true;
        if (onTick && Date.now() - tickAt > 5000) {
            tickAt = Date.now();
            onTick(page);
        }
        await sleep(200);
    }
    return false;
}

/* ------------------------------------------------------------------ *
 * 4. 跑
 * ------------------------------------------------------------------ */
globalThis.__stubSpeech = '';
const mod = await loadPageModule();
const page = makePage(mod.default);

let failed = 0;
const check = (name, cond, detail) => {
    if (!cond) failed++;
    console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? `　— ${detail}` : ''}`);
};

console.log(`\n── 真包 + 真后端全链路 ──`);
console.log(`被测代码：${sourceLabel}`);
console.log('后端：https://ziwei.secondplanet.cc（真 HTTPS，未打桩）\n');

/* ---- 排盘（端侧引擎，真） ---- */
const t0 = Date.now();
await page.onLoad({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
while (!page.data.ready && Date.now() - t0 < 10000) await sleep(40);
const ready = Boolean(page.data.ready);
console.log(`[排盘] ${Date.now() - t0}ms　运限层可用=${page.data.layersReady}`);
check('端侧引擎出盘', ready && Array.isArray(page.data.cells) && page.data.cells.length === 12,
    `cells=${page.data.cells && page.data.cells.length}`);
check('中宫有焦点行', typeof page.data.focusLine === 'string' && page.data.focusLine.length > 0,
    `focusLine=${page.data.focusLine}`);

/* ---- 选宫 ---- */
const b0 = page.data.selectedBranch;
tap(page, 'ArrowRight');
await sleep(200);
check('方向键选宫 +1 档', page.data.selectedBranch === (b0 + 1) % 12,
    `${b0} → ${page.data.selectedBranch}`);

/* ---- 单击问这一宫 → 真 /api/agent/reading（数据集原文） ---- */
console.log('\n[解读] 点「问这一宫」→ 真 /api/agent/reading');
await sleep(1500); // 脱离路由的 1000ms 冷却窗口
const tRead = Date.now();
tap(page, 'GlobalHook');
await sleep(600);
tap(page, 'Enter');
const gotReading = await waitSettled(page, 30000, (p) => {
    const t = p.data.chatTurns || [];
    console.log(`      … 等待解读落地（已 ${Date.now() - tRead}ms，pending=${t.length ? t[t.length - 1].pending : '-'}）`);
});
const readMs = Date.now() - tRead;
const rTurns = page.data.chatTurns || [];
const rTurn = rTurns[rTurns.length - 1] || {};
/* data.chatTurns 是 viewTurns 的视图模型：正文在 `a`（原始 turn 才是 `answer`） */
const rAnswer = rTurn.a || rTurn.answer || '';
const rows = page.data.chatRows || [];
console.log(`[解读] ${readMs}ms　对话 ${rTurns.length} 轮　本轮正文 ${rAnswer.length} 字　渲染行 ${rows.length} 行`);
check('解读请求成功并落地', gotReading && !rTurn.failed,
    rTurn.failed ? `failed=${rTurn.failed} answer=${rAnswer}` : '');
check('本轮正文非空', rAnswer.trim().length > 0, `${rAnswer.length} 字`);
check('正文没有 Markdown 标记残留', !/\*\*|^#{1,3}\s|🟢|🔵|🔴|🟡/m.test(rAnswer),
    /\*\*|^#{1,3}\s|🟢|🔵|🔴|🟡/m.test(rAnswer) ? '有残留' : '');
check('引文标注已显示', Boolean(rTurn.citation) && rTurn.citation.length > 0,
    `citation=${rTurn.citation}`);
const screenText = rows.map((r) => r.text || '').join('');
check('渲染层有正文', screenText.trim().length > 0, `屏显 ${screenText.length} 字 / ${rows.length} 行`);
console.log(`  ├ 渲染层屏显：${screenText.length} 字（${rows.length} 行）`);
console.log(`  ├ 本轮正文首段：${rAnswer.slice(0, 70)}…`);
console.log(`  └ 引文标注：${rTurn.citation}`);

/* ---- 对话页开口 → 真 /api/agent/ask ---- */
console.log('\n[追问] 模拟用户开口（桩麦克风喂一句话）→ 真 /api/agent/ask');
globalThis.__stubSpeech = '今年事业方面应该注意什么';
await sleep(1500);
const tAsk = Date.now();
tap(page, 'GlobalHook');
await sleep(600);
tap(page, 'Enter');
const gotAsk = await waitSettled(page, 150000, (p) => {
    const t = p.data.chatTurns || [];
    console.log(`      … 等待回答落地（已 ${Date.now() - tAsk}ms，pending=${t.length ? t[t.length - 1].pending : '-'}）`);
});
const askMs = Date.now() - tAsk;
const aTurns = page.data.chatTurns || [];
const aTurn = aTurns[aTurns.length - 1] || {};
const aAnswer = aTurn.a || aTurn.answer || '';
console.log(`[追问] ${askMs}ms　对话 ${aTurns.length} 轮　本轮回答 ${aAnswer.length} 字`);
check('追问拿到回答', gotAsk && aAnswer.trim().length > 0,
    `failed=${aTurn.failed} answer=${aAnswer.length} 字　short=${aTurn.short || ''}`);
check('回答正文没有 Markdown 标记残留', !/\*\*|^#{1,3}\s/m.test(aAnswer));
console.log(`  └ 回答首段：${aAnswer.slice(0, 70)}…`);

/* ---- 再问一轮（带上文） ---- */
console.log('\n[追问2] 再问一轮（应带上文）');
globalThis.__stubSpeech = '那感情方面呢';
await sleep(1500);
const tAsk2 = Date.now();
tap(page, 'GlobalHook');
await sleep(600);
tap(page, 'Enter');
const gotAsk2 = await waitSettled(page, 150000, (p) => {
    const t = p.data.chatTurns || [];
    console.log(`      … 等待回答落地（已 ${Date.now() - tAsk2}ms，pending=${t.length ? t[t.length - 1].pending : '-'}）`);
});
const ask2Ms = Date.now() - tAsk2;
const turns2 = page.data.chatTurns || [];
const last2 = turns2[turns2.length - 1] || {};
console.log(`[追问2] ${ask2Ms}ms　对话 ${turns2.length} 轮　本轮回答 ${(last2.a || last2.answer || '').length} 字`);
check('第二轮追问成功', gotAsk2 && (last2.a || last2.answer || '').trim().length > 0);

console.log('\n── 汇总 ──');
console.log(`  解读 ${readMs}ms　追问1 ${askMs}ms　追问2 ${ask2Ms}ms`);
console.log('  客户端超时设定：chart 8000 / reading 10000 / ask 120000');
console.log(`  ${failed === 0 ? '全部通过' : `${failed} 项未通过`}\n`);

if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
