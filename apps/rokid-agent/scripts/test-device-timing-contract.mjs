#!/usr/bin/env node
/**
 * 真机**手势时序契约**测试 —— 补模拟器测不到的那一层。
 *
 * ⚠️ **为什么现有模拟器「总是无用」**（这是本脚本存在的理由）：
 *
 * `simulate-interaction-chain.mjs` 把真机的「手势 → 键值 → 时序」整条链
 * **写死成了三个常量**：
 *   · 双击：GlobalHook ×2，间隔 **120ms**，随后补发 Backspace
 *   · 单击：GlobalHook，随后 **600ms** 补发 Enter
 *   · 滑动：GlobalHook，随后 **60ms** 发一对方向键
 *
 * 也就是说：**模拟器是拿「我们对真机的假设」当输入，再用同一套假设去验证它自己。**
 * 假设错了，测试照样全绿 —— 而商店那次驳回（「arrow 滑动事件问题 无法切换
 * 请检查 global hook 相关」）恰恰就发生在这层：
 * **物理手势 → 宿主投递的键值与时序**，是模拟器**根本碰不到**的边界。
 *
 * 本脚本做的不是「再跑一遍模拟」，而是：
 *   · 用**真代码**（打包产物的 `lib/temple-input.js` + `pages/index/index.ink`）；
 *   · 把**真机时序当变量扫一遍**（双击间隔 / 补发延迟 / 方向键配对间隔）；
 *   · 输出**阈值表**：真机落在哪个区间内界面就成立；落在外面会变成什么样。
 *
 * 扫完这张表，「模拟器说 40/40 通过」就变成了「真机只要满足这几条时序约束就成立」，
 * 而那几条约束**每个都能在眼镜上 10 秒测出来**（面板诊断行会显示「按键 XXX」，
 * 日志会打印 `[ziwei-agent] input down raw=... action=...`）。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/test-device-timing-contract.mjs
 *   node apps/rokid-agent/scripts/test-device-timing-contract.mjs --pkg <aix 路径>
 *   node apps/rokid-agent/scripts/test-device-timing-contract.mjs --repo   # 用仓库源码而非发布包
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
 * 1. 取到「要测的那份代码」：发布包解出来，或直接用仓库源码
 * ------------------------------------------------------------------ */
let sourceRoot;
let sourceLabel;
let tmpDir;

if (useRepo) {
    sourceRoot = AGENT_ROOT;
    sourceLabel = '仓库源码（apps/rokid-agent/）';
} else {
    if (!fs.existsSync(pkgPath)) {
        console.error(`✗ 找不到发布包：${pkgPath}\n  用 --repo 测仓库源码，或用 --pkg 指定别的包。`);
        process.exit(2);
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-timing-'));
    execFileSync('unzip', ['-q', pkgPath, '-d', path.join(tmpDir, 'pkg')], { stdio: 'ignore' });
    sourceRoot = path.join(tmpDir, 'pkg');
    sourceLabel = `发布包 ${path.basename(pkgPath)}`;
}

const INK_PAGE = path.join(sourceRoot, 'pages', 'index', 'index.ink');
const LIB_DIR = path.join(sourceRoot, 'lib');

/* ------------------------------------------------------------------ *
 * 2. 加载页面模块：只桩掉「语音」和「后端」，其余全是真代码
 * ------------------------------------------------------------------ */
async function loadPageModule() {
    const ink = fs.readFileSync(INK_PAGE, 'utf8');
    const start = ink.indexOf('<script setup>');
    const end = ink.indexOf('</script>', start);
    if (start < 0 || end < 0) throw new Error('index.ink 里找不到 <script setup> 块');

    let body = ink.slice(start + '<script setup>'.length, end);

    /** 真库 → 真文件；被桩的库 → 内联桩 */
    const stubbed = new Set(['voice-input.js', 'api.js']);
    body = body.replace(/from\s+'\.\.\/\.\.\/lib\/([^']+)'/g, (_m, rel) => {
        if (stubbed.has(rel)) return `from '${rel}'`;
        return `from '${pathToFileURL(path.join(LIB_DIR, rel)).href}'`;
    });

    /* 语音桩：node 里没有麦克风，这里只替换「用户说了什么」 */
    const voiceImportRe = /import\s*\{([^}]*)\}\s*from\s*'voice-input\.js';/;
    const voiceMatched = body.match(voiceImportRe);
    if (!voiceMatched) throw new Error('没能找到 voice-input 导入 —— index.ink 的导入写法变了？');
    const voiceNames = voiceMatched[1]
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
    const voiceStubs = {
        listenOnce: 'const listenOnce = __say;',
        listenContinuous: 'const listenContinuous = __say;',
        cancelListen: 'const cancelListen = () => {};',
        withTimeout: 'const withTimeout = async (p) => p;',
        VOICE_HARD_TIMEOUT: 'const VOICE_HARD_TIMEOUT = 14000;'
    };
    const unknown = voiceNames.filter((n) => !(n in voiceStubs));
    if (unknown.length) {
        throw new Error(`voice-input 的新导出没有桩：${unknown.join('、')} —— 请补上`);
    }
    body = body.replace(
        voiceImportRe,
        [
            'const __say = async (opts) => {',
            '    const text = globalThis.__stubSpeech || "";',
            '    if (opts && typeof opts.onPartial === "function") opts.onPartial(text);',
            '    return text;',
            '};',
            ...voiceNames.map((n) => voiceStubs[n])
        ].join('\n')
    );

    /* 后端桩：只桩「解读 / 追问」两个出口，排盘走真端侧引擎 */
    const apiImportRe = /import\s*\{([^}]*)\}\s*from\s*'api\.js';/;
    const apiMatched = body.match(apiImportRe);
    if (!apiMatched) throw new Error('没能找到 api 导入 —— index.ink 的导入写法变了？');
    const apiNames = apiMatched[1]
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
    const apiStubs = {
        requestChart: 'const requestChart = async () => { throw new Error("排盘桩被调用了"); };',
        requestReading:
            'const requestReading = async () => { globalThis.__readingCalls = (globalThis.__readingCalls || 0) + 1; ' +
            'return { status: "ok", dimensions: [{ key: "overview", label: "总览", text: "解读原文。" }], ' +
            'citationModeLabel: "引文正常" }; };',
        requestAsk:
            'const requestAsk = async () => { globalThis.__askCalls = (globalThis.__askCalls || 0) + 1; ' +
            'return { answer: "模型回答。", cited: [], verification: "", model: "stub", citationModeLabel: "引文正常" }; };'
    };
    const apiUnknown = apiNames.filter((n) => !(n in apiStubs));
    if (apiUnknown.length) {
        throw new Error(`api.js 的新导出没有桩：${apiUnknown.join('、')} —— 请补上`);
    }
    body = body.replace(
        apiImportRe,
        [
            ...apiNames.map((n) => apiStubs[n]),
            'const API_BASE = "stub";',
            'const TIMEOUTS = { chart: 8000, reading: 10000, ask: 120000 };'
        ].join('\n')
    );

    const tmp = path.join(tmpDir || os.tmpdir(), `ziwei-timing-setup-${process.pid}.mjs`);
    fs.writeFileSync(tmp, body, 'utf8');
    try {
        return await import(pathToFileURL(tmp).href);
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

/** 最小 Ink 运行时 */
function makePage(def) {
    const page = Object.create(def);
    page.data = JSON.parse(JSON.stringify(def.data || {}));
    page.setData = function setData(patch) {
        Object.assign(this.data, patch || {});
    };
    page.finish = function finish() {
        this._finished = true;
    };
    /* 记录真正派发出去的动作（页面唯一的动作入口） */
    page.__actions = [];
    const orig = def._dispatchKey;
    page._dispatchKey = function _dispatchKey(action) {
        page.__actions.push(action);
        return orig.call(this, action);
    };
    return page;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 宿主派发一次物理按键（keydown + keyup） */
function tap(page, code) {
    page.onKeyDown({ code, preventDefault() {} });
    page.onKeyUp({ code, preventDefault() {} });
}

const ACTION_ZH = {
    up: '选宫 -1',
    down: '选宫 +1',
    left: '选宫 -1',
    right: '选宫 +1',
    confirm: '确认（问这一宫 / 开口说话）',
    back: '返回（退出应用 / 回盘面）',
    temple: '镜腿',
    double: '双击（切时间层 / 用建议语发问）'
};

/* ------------------------------------------------------------------ *
 * 3. 用例：把「真机时序」当变量扫
 * ------------------------------------------------------------------ */
const SEQ = {
    /** 单击：GlobalHook → 补发 Enter（补发延迟 = enterDelay） */
    single: (enterDelay) => [
        { code: 'GlobalHook' },
        { wait: enterDelay },
        { code: 'Enter' }
    ],
    /** 双击：GlobalHook ×2（间隔 gap）→ 补发 Backspace（延迟 backDelay） */
    double: (gap, backDelay) => [
        { code: 'GlobalHook' },
        { wait: gap },
        { code: 'GlobalHook' },
        { wait: backDelay },
        { code: 'Backspace' }
    ],
    /** 滑动：GlobalHook → 一对方向键（配对间隔 pairGap，方向键延迟 arrowDelay） */
    swipe: (pairGap, arrowDelay) => [
        { code: 'GlobalHook' },
        { wait: arrowDelay },
        { code: 'ArrowRight' },
        { wait: pairGap },
        { code: 'ArrowDown' }
    ],
    /** 裸返回键 */
    back: () => [{ code: 'Backspace' }]
};

const CASES = [
    {
        id: 'single-600',
        title: '单击（补发 Enter 延迟 600ms）',
        seq: SEQ.single(600),
        want: { palace: 0, layer: false, asked: 1, exited: false }
    },
    {
        id: 'single-1400',
        title: '单击（补发 Enter 延迟 1400ms —— 补发很慢）',
        seq: SEQ.single(1400),
        want: { palace: 0, layer: false, asked: 1, exited: false }
    },
    {
        id: 'double-120',
        title: '双击（两下间隔 120ms —— 模拟器用的值）',
        seq: SEQ.double(120, 120),
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'double-250',
        title: '双击（两下间隔 250ms）',
        seq: SEQ.double(250, 120),
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'double-320',
        title: '双击（两下间隔 320ms）',
        seq: SEQ.double(320, 120),
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'double-400',
        title: '双击（两下间隔 400ms —— 真机双击常见间隔）',
        seq: SEQ.double(400, 120),
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'double-120-back-1200',
        title: '双击（间隔 120ms，但补发 Backspace 迟到 1200ms）',
        seq: SEQ.double(120, 1200),
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'swipe-60',
        title: '滑动（方向键配对间隔 60ms —— 模拟器用的值）',
        seq: SEQ.swipe(60, 60),
        want: { palace: 1, layer: false, asked: 0, exited: false }
    },
    {
        id: 'swipe-300',
        title: '滑动（方向键配对间隔 300ms —— 方向键迟到）',
        seq: SEQ.swipe(300, 60),
        want: { palace: 1, layer: false, asked: 0, exited: false }
    },
    {
        id: 'swipe-arrow-late',
        title: '滑动（方向键在 400ms 后才到）',
        seq: SEQ.swipe(60, 400),
        want: { palace: 1, layer: false, asked: 0, exited: false }
    },
    {
        id: 'single-then-single-300',
        title: '连点两下（第二下距第一下 950ms —— 在冷却窗口内）',
        seq: [
            { code: 'GlobalHook' },
            { wait: 900 },
            { code: 'Enter' },
            { wait: 50 },
            { code: 'GlobalHook' },
            { wait: 700 },
            { code: 'Enter' }
        ],
        want: { palace: 0, layer: false, asked: 1, exited: false }
    },
    {
        id: 'single-then-single-1500',
        title: '连点两下（第二下距第一下 1500ms —— 超出冷却窗口）',
        seq: [
            { code: 'GlobalHook' },
            { wait: 900 },
            { code: 'Enter' },
            { wait: 1500 },
            { code: 'GlobalHook' },
            { wait: 700 },
            { code: 'Enter' }
        ],
        want: { palace: 0, layer: false, asked: 2, exited: false }
    },
    {
        id: 'single-no-enter',
        title: '单击但宿主**不补发 Enter**（只有镜腿事件）',
        seq: [{ code: 'GlobalHook' }],
        want: { palace: 0, layer: false, asked: 1, exited: false }
    },
    {
        id: 'double-no-backspace',
        title: '双击但宿主**不补发 Backspace**（只有两下镜腿事件）',
        seq: [{ code: 'GlobalHook' }, { wait: 120 }, { code: 'GlobalHook' }],
        want: { palace: 0, layer: true, asked: 0, exited: false }
    },
    {
        id: 'single-no-enter-within-cooldown',
        title: '上一次确认后 950ms 再点一下，且宿主**不补发 Enter**',
        seq: [{ code: 'GlobalHook' }, { wait: 950 }, { code: 'GlobalHook' }],
        want: { palace: 0, layer: false, asked: 2, exited: false }
    },
    {
        id: 'bare-back',
        title: '裸返回键（用户想退出应用）',
        seq: SEQ.back(),
        want: { palace: 0, layer: false, asked: 0, exited: true }
    }
];

/* ------------------------------------------------------------------ *
 * 4. 跑
 * ------------------------------------------------------------------ */
globalThis.__stubSpeech = '';
const mod = await loadPageModule();

/** 页面日志太吵，跑用例时静音（只留我们自己打的） */
const realInfo = console.info;
console.info = () => {};

console.log(`\n── 真机手势时序契约测试 ──`);
console.log(`被测代码：${sourceLabel}`);
console.log('路由窗口（来自打包版 lib/temple-input.js）：');
console.log(
    '  settleMs(单击延迟确认)=300 · templeRepeatMs(镜腿去回声)=60 · cooldownMs(补发吸收)=1000\n' +
        '  dirPairWindowMs(方向键配对)=200 · doubleTapWindowMs(双击补发)=900 · upPairWindowMs(镜腿抬起)=1000'
);
console.log('');

const rows = [];
for (const c of CASES) {
    globalThis.__readingCalls = 0;
    globalThis.__askCalls = 0;
    const page = makePage(mod.default);
    await page.onLoad({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
    const t0 = Date.now();
    while (!page.data.ready && Date.now() - t0 < 8000) await sleep(30);

    const before = {
        branch: page.data.selectedBranch,
        layerKey: page.data.layerKey,
        finished: Boolean(page._finished)
    };

    for (const step of c.seq) {
        if (step.wait) await sleep(step.wait);
        if (step.code) tap(page, step.code);
    }
    await sleep(800); // 给 settle / 补发留出落地时间

    const acts = page.__actions;
    let palace = 0;
    let layer = false;
    let asked = 0;
    let exited = false;
    for (const a of acts) {
        if (a === 'right' || a === 'down') palace += 1;
        else if (a === 'left' || a === 'up') palace -= 1;
        else if (a === 'double') layer = true;
        else if (a === 'confirm') asked += 1;
        else if (a === 'back') exited = true;
    }
    const exitedNow = Boolean(page._finished);
    const layerChanged = page.data.layerKey !== before.layerKey;
    const readingCalls = globalThis.__readingCalls || 0;
    const askCalls = globalThis.__askCalls || 0;

    const got = {
        palace,
        layer: layerChanged,
        /** 派发出去的「确认」次数 —— 不是请求次数：
         *  第二次确认如果命中解读缓存，请求数不变，但**用户仍然看见/听到第二次动作**。 */
        asked,
        exited: exitedNow,
        ask: askCalls,
        readingCalls,
        screen: page.data.screen
    };
    const want = c.want;
    const ok =
        got.palace === want.palace &&
        got.layer === want.layer &&
        got.asked === want.asked &&
        got.exited === want.exited;

    const parts = [];
    if (got.palace) parts.push(`选宫 ${got.palace > 0 ? '+' : ''}${got.palace} 档`);
    if (got.layer) parts.push('切时间层');
    if (got.asked) parts.push(got.asked > 1 ? `**问这一宫 ×${got.asked}**` : '问这一宫');
    if (got.ask) parts.push('发起追问');
    if (got.exited) parts.push('**退出应用**');
    if (!parts.length) parts.push('（无动作）');

    rows.push({
        ...c,
        ok,
        acts,
        got,
        parts: parts.join(' + '),
        actionTrace: acts.length ? acts.map((a) => ACTION_ZH[a] || a).join(' → ') : '（无动作派发）'
    });
}

console.info = realInfo;

let broken = 0;
for (const r of rows) {
    if (!r.ok) broken++;
    console.log(`${r.ok ? '✓ 达标' : '✗ 破线'}  ${r.title}`);
    console.log(`      派发：${r.actionTrace}`);
    console.log(`      实际：${r.parts}　|　结束时所在屏：${r.got.screen}`);
    console.log('');
}

console.log(`结果：${rows.length - broken} / ${rows.length} 条达标，${broken} 条破线。`);
console.log(
    '\n判读：**破线行 = 真机时序一旦落在那个区间，界面上就会变成那样。**\n' +
        '把这些行变成「眼镜上 10 秒能测出来」的约束，比在模拟器里多跑 100 个用例有用得多。'
);

if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(broken > 0 ? 1 : 0);
