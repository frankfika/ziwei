#!/usr/bin/env node
/**
 * 取 AIX 包并核验「包里就是仓库里的最新代码」。
 *
 * 为什么要有这个脚本（2026-11-08 加）：
 *   AIUI Studio 的「下载AIX包」按钮在**内置浏览器**里点不动 —— 文件被浏览器
 *   的下载管理器吞掉，落到 `~/Downloads` 的只有同名临时文件。
 *   于是「打包完了，包到底是不是最新代码」就只能靠感觉。
 *
 *   实际上根本不需要那个按钮。Rokid 的包就躺在**公开 CDN** 上，URL 是可推导的：
 *
 *     https://basecloud.rokidcdn.com/basecloud/prod/<AgentID>-<打包时间戳>.aix
 *
 *   （底层是 `rokid-basecloud.oss-cn-hangzhou.aliyuncs.com`，同样的路径）
 *   免鉴权、可直接 curl —— `HEAD` 就能拿到 content-length 与 MD5 对账。
 *
 * 本脚本做五件事，除了「仓库领先本版」这一种预期状态，其余任何一件不过就退出码非 0：
 *   1. 下载 AIX（也可传 --url 直接给地址），校验 MD5（给了 --expect-md5 才校验）
 *   2. 解包，逐项核对 manifest 里的 sha256
 *   3. **行为等价比对**：把**包内**的引擎与出生参数模块，跟**仓库里**的跑同一批输入，
 *      输出必须逐字段一致 —— 这才是「包里是最新代码」的硬证据
 *      （包内代码被「资源优化 等级2」压过，字节比不了，只能比行为）
 *   4. 核对关键文件确实在包里：index.ink、lib/birth-source.js、assets/engine.js
 *   5. **对外文案逐字一致**：JS 字面量 + 模板区中文，**双向**查（包缺 / 包多）
 *
 * ⚠ 「仓库领先本版」是**预期状态**，不算失败（2026-11-13 晚加）：
 *   改了 index.ink 之后，仓库必然领先已发布的那个包（还没重打包）。
 *   老的两态写法会把这种状态判成失败 ⇒ 每改一行代码核验就假红一次。
 *   三态判定见 main() 里的注释；鉴别力用旧包反证（--pkg prev-v1018 必须红）。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/fetch-aix.mjs                     # 拉「当前版」
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --list              # 只看已知包清单
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --url <url> --expect-md5 <md5>
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --keep               # 保留解包目录
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = path.resolve(SCRIPT_DIR, '..');
const REPO_ROOT = path.resolve(AGENT_DIR, '../..');
const OUT_DIR = path.join(AGENT_DIR, 'submit-kit/aix');

/** Agent ID：AIUI Studio 建工程时生成，商店回调给报名表用的那个 */
const AGENT_ID = 'bcdceff1163f4e6e8dea474d03b5f0c9';

/** CDN 基址 */
const CDN = 'https://basecloud.rokidcdn.com/basecloud/prod';

/**
 * 已知包清单。
 * `current` = 当前应当装在眼镜上的那一版；其余是历史版（留着是为了对账时能认出「拿错包了」）。
 */
const KNOWN_PACKAGES = [
  {
    key: 'current',
    file: `${AGENT_ID}-1794538212787.aix`,
    md5: '8eecb8194aba2b12f2d935251f572ecd',
    /**
     * 已发布基线行数 = **打包那一刻**仓库里 index.ink 的行数。
     * 用途：区分两种「行数不一致」——
     *   ① 仓库领先（本地改了、还没重打包）⇒ 预期状态，只告警；
     *   ② 装错包（包内行数连基线都不是）⇒ 真失败。
     * 没有这条基线，仓库每改一行核验脚本就会假红一次。
     */
    inkLines: 2227,
    note: '2026-11-13 10:5x 重打，**3.61 MB / 3,788,156 B**；**v1.0.20 —— 现行版，Frank 装这一版**。含本轮七件事：① 显示层整体优化（正文按段落渲染 + 最新一轮置顶 + 标注行提前 + 状态行分层 + 字号 9→11px）；② 语音输入致命缺陷修复（空结果不清空已听文本 / 迟到结果丢弃 / 硬超时 14s 看门狗 / wx 契约对齐）；③ 模板注释被当文字渲染 + 自己的盘引导语写错；④ **对外说明里的手势口径修正**（工具 description 原来写「双击换生辰」，实际「连点两下」是切运限层、换生辰走语音）。核验新增两条断言：「语音输入 wx 宿主行为 8/8」（造 wx 宿主桩给包内/仓库喂同一串事件比对）与「对外文案逐字一致 8 条中文字面量」（专治「改了字、没改行数」—— 行数检查抓不到等行数的内容变更）',
    current: true,
  },
  {
    key: 'prev-v1019',
    file: `${AGENT_ID}-1794537604280.aix`,
    md5: 'b788ed4db4fce874ea43f0360d9ad6ff',
    note: '2026-11-13 10:4x 重打，3.60 MB；**v1.0.19**。含①②③，**不含④**（对外说明里的手势口径还是旧的「双击换生辰」）⇒ 已被 v1.0.20 取代。⚠️ 包比 v1.0.18 小 5.06 MB 不是丢东西 —— 是包内嵌的预览视频从 6.1 MB 换成了 1.0 MB 的重渲版',
    current: false,
  },
  {
    key: 'prev-v1018',
    file: `${AGENT_ID}-1794503370363.aix`,
    md5: 'fdd8bc98ccbdec340c8282f4e00b6a77',
    note: '2026-11-13 01:1x 重打，8.66 MB；**v1.0.18**。含交互整体重做 + 正文纯文本化 + 追问瞬时故障重试；**不含**本轮七件事（显示层优化 / 语音致命缺陷 / 模板注释 / 对外文案口径）。用它试跑核验可以自证新断言有鉴别力（语音场景会红）',
    current: false,
  },
  {
    key: 'prev-v1015',
    file: `${AGENT_ID}-1794494267342.aix`,
    md5: 'dcd16bc45783e8d51574b4e082cad13a',
    note: '2026-11-12 22:37 重打，8.48 MB；**v1.0.15 拟提审版**。含 2026-11-12 早间两轮交互修复（cdcda9b + db2b387）+ 追问超时 120s + 端侧引擎 Intl.PluralRules 兜底 + 时辰入口改造；`npm run aix:fetch` 全项核验通过（index.ink 行数一致 / 追问超时一致 / 出生参数三级兜底 9/9 / 端侧排盘+运限三层 8/8 / 晚子时口径 / 十二宫外圈巡宫），定点 grep 确认含 `cancelListen`、代际令牌 `_voiceSeq`/`_readingSeq`/`_askSeq`、「返回键回盘面」',
    current: false,
  },
  {
    key: 'prev-1108-1919',
    file: `${AGENT_ID}-1794136722831.aix`,
    md5: '676f6c4f6d1bcbed5fa756e6024b8cfc',
    note: '2026-11-08 19:19 重打，8.63 MB；含追问超时修复（120s）+ 端侧引擎 Intl.PluralRules 兜底（模块作用域遮蔽版）+ **时辰入口改造**（提示改口语、缺时辰落午时并标估算、修掉「解析成功浮层不关」致命 bug）。⚠️ **不含 2026-11-12 两轮交互修复**（cdcda9b + db2b387），已被 v1.0.15 取代',
    current: false,
  },
  {
    key: 'prev-intl-shim',
    file: `${AGENT_ID}-1794133305274.aix`,
    md5: '3bf19fa781f34d822050e71a050ef009',
    note: '2026-11-08 18:21 重打，8.62 MB；含追问超时修复 + 端侧引擎 Intl.PluralRules 兜底（模块作用域遮蔽版），但**还没有时辰入口改造**',
    current: false,
  },
  {
    key: 'broken-intl-shim',
    file: `${AGENT_ID}-1794132724122.aix`,
    md5: 'f4242402d678714d32b8ab16a15fbedf',
    note: '2026-11-08 18:12 那一版 —— 端侧引擎带了第一版坏补丁（写 globalThis.Intl），眼镜上 ReferenceError 直接崩引擎，已作废',
    current: false,
  },
  {
    key: 'prev-headfix',
    file: `${AGENT_ID}-1794128239691.aix`,
    md5: 'be19541710a792b8d69a330280c555d8',
    note: '2026-11-08 16:57 重打，8.61 MB；含追问超时修复，包内预览视频已是首帧修复版；引擎还没打 Intl.PluralRules 兜底',
    current: false,
  },
  {
    key: 'prev-submitted',
    file: `${AGENT_ID}-1794105155119.aix`,
    md5: '5c548ed6260dcae43e4389024894b135',
    note: '2026-11-08 10:33 重打，8.96 MB —— 提审时提交的就是这一版；包内预览视频是首帧修复前的旧版（7.09 MB）',
    current: false,
  },
  {
    key: 'no-timeout-fix',
    file: `${AGENT_ID}-1794100520699.aix`,
    md5: 'a88725d8862ee7a60dca2b74ec59a33b',
    note: '2026-11-08 10:08 那一版 —— 含「追问超时 40s」的老 bug，已作废',
    current: false,
  },
  {
    key: 'stale',
    file: `${AGENT_ID}-1794011125685.aix`,
    md5: null,
    note: '2026-11-07 那一版 —— 修「模拟器出不了盘」之前的代码，已作废',
    current: false,
  },
];

/** 用于行为等价比对的输入（覆盖：正常入参 / 缺字段 / 越界 / 带存档 / 什么都没有） */
const BIRTH_CASES = [
  { query: { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' }, saved: null },
  { query: { year: 2000, month: 2, day: 29, hour: 11, gender: 'female', name: '甲' }, saved: null },
  { query: { year: 1990, month: 13, day: 1, hour: 0, gender: 'male' }, saved: null },
  { query: { year: 1889, month: 1, day: 1, hour: 0, gender: 'male' }, saved: null },
  { query: { year: 1990, month: 1, day: 1, hour: 12, gender: 'male' }, saved: null },
  { query: { year: 1990, month: 1, day: 1, hour: 0, gender: 'other' }, saved: null },
  { query: {}, saved: { year: 1988, month: 3, day: 12, hour: 7, gender: 'female' } },
  { query: null, saved: null },
  { query: {}, saved: { year: 1988, month: 3, day: 12 } },
];

/** 引擎比对用的生辰 */
const ENGINE_CASES = [
  { year: 1950, month: 1, day: 1, hour: 0, gender: 'male' },
  { year: 1990, month: 3, day: 15, hour: 1, gender: 'male' },
  { year: 1990, month: 6, day: 25, hour: 5, gender: 'male' },
  { year: 1990, month: 12, day: 31, hour: 3, gender: 'female' },
  { year: 2000, month: 2, day: 29, hour: 6, gender: 'male' },
  { year: 2000, month: 3, day: 15, hour: 11, gender: 'female' },
  { year: 2020, month: 5, day: 30, hour: 7, gender: 'female' },
  { year: 2026, month: 12, day: 31, hour: 11, gender: 'female' },
];

function parseArgs(argv) {
  const out = { list: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--keep') out.keep = true;
    else if (a === '--url') out.url = argv[++i];
    else if (a === '--expect-md5') out.expectMd5 = argv[++i];
    else if (a === '--pkg') out.pkgKey = argv[++i];
  }
  return out;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

/** 下载到内存（2 MB 量级，直接吃内存比落盘再读省事） */
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status} ${res.statusText} —— ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 解 zip：优先用系统 unzip，其次用 ditto */
function unzip(buffer, dest) {
  const zipPath = path.join(dest, 'pkg.aix');
  writeFileSync(zipPath, buffer);
  const target = path.join(dest, 'x');
  execFileSync('unzip', ['-q', zipPath, '-d', target]);
  return target;
}

/** 深比较（顺序敏感的 JSON 结构） */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 动态 import 一个 ESM 模块 */
async function load(absPath) {
  return import(pathToFileURL(absPath).href);
}

/**
 * 从 api.js 源码里抠出「追问超时」的毫秒数。
 *
 * 为什么用正则抠、而不是 import 进来读 TIMEOUTS.ask：
 *   包内代码被「资源优化 等级2」压过，数值会变成科学计数法
 *   （40 秒写成 `ask:4e4`，120 秒写成 `ask:12e4`），
 *   而且包内文件不一定能被 Node 当 ESM 加载。
 *   正则 + Number() 对两种写法都成立（Number('4e4') === 40000）。
 */
function extractAskTimeout(src) {
  const m = src.match(/ask\s*:\s*([0-9]+(?:\.[0-9]+)?(?:e[+-]?[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 核对「包里的追问超时」与「仓库源码」一致。
 *
 * 这条是 2026-11-08 加的：眼镜端 TIMEOUTS.ask 从 40s 提到 120s
 * （原值比服务端先放弃，实测 /api/agent/ask 真实耗时 41.0s / 49.3s / 16.4s / 23.8s），
 * 这个修复**必须确认进了包** —— 否则装到眼镜上追问还是会随机失败。
 */
function checkAskTimeout(pkgRoot) {
  const pkgSrc = readFileSync(path.join(pkgRoot, 'lib/api.js'), 'utf8');
  const repoSrc = readFileSync(path.join(REPO_ROOT, 'apps/rokid-agent/lib/api.js'), 'utf8');
  const pkgVal = extractAskTimeout(pkgSrc);
  const repoVal = extractAskTimeout(repoSrc);
  if (pkgVal === null || repoVal === null) {
    return { ok: false, message: `追问超时抠不出来：包内 ${pkgVal}，仓库 ${repoVal}` };
  }
  if (pkgVal !== repoVal) {
    return {
      ok: false,
      /** soft = 「仓库领先本版」时这只是一条预期差异，不是「装错包」的证据 */
      soft: true,
      message: `追问超时不一致：包内 ${pkgVal}ms，仓库 ${repoVal}ms —— 包不是最新代码`,
    };
  }
  if (pkgVal < 120000) {
    return {
      ok: false,
      message: `追问超时 ${pkgVal}ms 低于修复后的 120000ms —— 包里是修超时之前的老代码`,
    };
  }
  return { ok: true, value: pkgVal };
}

/**
 * wx 宿主桩 —— 用来把 `wx.speech.startRecognition` 的回调**按剧本**触发。
 *
 * 为什么需要桩：
 *   `lib/voice-input.js` 里唯一一条 `import('wx')` 是动态导入。
 *   在 node 里直接跑，它会导入失败 → 落到 Web 分支 → node 没有
 *   `SpeechRecognition` → 直接返回空串 ⇒ **什么都测不到**。
 *
 * 所以给包内版和仓库版各配一份沙箱（沙箱里放 node_modules/wx 桩），
 * 两边喂**同一串事件**，比对最终拿到的文本。
 *
 * 桩实现的是宿主真实契约（2026-11-13 从 ink_web_bg.wasm 的字符串表里核过）：
 *   读 `continuous` / `interimResults` / `maxAlternatives`，
 *   回调 `onresult` / `onend`（**不认** `success` / `fail`，但老宿主会用）。
 */
const VOICE_WX_STUB = `export const speech = {
  startRecognition(opts) {
    globalThis.__wxVoiceCtl = {
      opts,
      result(payload) { if (typeof opts.onresult === 'function') opts.onresult(payload); },
      end() { if (typeof opts.onend === 'function') opts.onend(); },
      success(payload) { if (typeof opts.success === 'function') opts.success(payload); },
      fail() { if (typeof opts.fail === 'function') opts.fail(); },
    };
  },
  stopRecognition() {},
};
export default { speech };
`;

/**
 * 语音输入行为场景。
 *
 * `expect` 是**从仓库源码推导**出来的期望值，不是从包内跑出来的 ——
 * 所以「两边一致」且「两边都等于 expect」才算过。
 * 只要包内少了那一行 `if (text) lastText = text;`，这条就会红。
 */
const VOICE_SCENARIOS = [
  {
    name: '宿主先给文本、再给空结果（空结果不许清空已听到的话）',
    events: [
      { k: 'result', p: { transcript: '1989年12月5日 子时 男' } },
      { k: 'result', p: { transcript: '' } },
      { k: 'end' },
    ],
    expect: '1989年12月5日 子时 男',
  },
  {
    name: '只有一次结果就收尾',
    events: [{ k: 'result', p: { transcript: '今天财运如何' } }, { k: 'end' }],
    expect: '今天财运如何',
  },
  {
    name: '宿主不收尾（靠静音窗口收工）',
    events: [{ k: 'result', p: { transcript: '静音收尾测试' } }, { k: 'wait', ms: 320 }],
    expect: '静音收尾测试',
  },
  {
    name: '收尾之后才到的结果必须被丢弃',
    events: [
      { k: 'result', p: { transcript: '先到的那句' } },
      { k: 'end' },
      { k: 'wait', ms: 30 },
      { k: 'result', p: { transcript: '迟到的结果' } },
    ],
    expect: '先到的那句',
  },
  {
    name: '宿主完全不回调（硬超时后返回空串，不能挂死）',
    events: [],
    expect: '',
  },
  {
    name: '最终结果 + 增量（partialText 追加）',
    events: [
      { k: 'result', p: { transcript: '前半句' } },
      { k: 'result', p: { partialText: '后半句' } },
      { k: 'end' },
    ],
    expect: '前半句后半句',
  },
  {
    name: '老宿主的 success 契约（只给最终结果）',
    events: [{ k: 'success', p: { result: '完整的一句' } }, { k: 'end' }],
    expect: '完整的一句',
  },
  {
    name: '老宿主的 fail 契约（没听到东西）',
    events: [{ k: 'fail' }],
    expect: '',
  },
];

/** 在沙箱里放一份 voice-input.js + wx 宿主桩，返回可 import 的路径 */
function prepareVoiceSandbox(srcPath, dir) {
  mkdirSync(path.join(dir, 'node_modules/wx'), { recursive: true });
  copyFileSync(srcPath, path.join(dir, 'voice-input.js'));
  writeFileSync(
    path.join(dir, 'node_modules/wx/package.json'),
    JSON.stringify({ name: 'wx', version: '0.0.0', type: 'module', main: 'index.mjs' }),
  );
  writeFileSync(path.join(dir, 'node_modules/wx/index.mjs'), VOICE_WX_STUB);
  return path.join(dir, 'voice-input.js');
}

/** 按剧本跑一个场景，返回识别到的文本 */
async function runVoiceScenario(mod, scenario) {
  globalThis.__wxVoiceCtl = null;
  const p = mod.listenSession({ timeout: 400, silenceMs: 150, continuous: true });
  await new Promise((r) => setTimeout(r, 25));
  const ctl = globalThis.__wxVoiceCtl;
  if (!ctl) return { value: null, error: '宿主桩没被调用（说明没走 wx 分支）' };
  for (const ev of scenario.events) {
    if (ev.k === 'result') ctl.result(ev.p);
    else if (ev.k === 'end') ctl.end();
    else if (ev.k === 'success') ctl.success(ev.p);
    else if (ev.k === 'fail') ctl.fail();
    else if (ev.k === 'wait') await new Promise((r) => setTimeout(r, ev.ms));
  }
  const value = await p;
  return { value, error: null };
}

/**
 * 比对「包内的语音输入模块」与「仓库里的」行为是否一致。
 *
 * 为什么单独加这条（2026-11-13）：
 *   这一轮的核心修复**全在** lib/voice-input.js 里 ——
 *   ① 宿主先给一次文本、再给一次**空**结果时，收尾不能把已经听到的话丢掉
 *      （2026-11-13 实测宿主事件顺序正是 onresult(文本) → onresult(空) → onend）；
 *   ② 识别器不收尾时必须有硬超时，不能让页面的「正在听」永远不解
 *      （眼镜上没有键盘，卡死等于只能重开应用）。
 *   而旧的核验**只比了** birth-source / engine / chart-layout ——
 *   恰好漏掉了这个最要命的文件。
 */
async function compareVoiceInput(pkgRoot) {
  const problems = [];
  const checks = [];

  const sandbox = mkdtempSync(path.join(tmpdir(), 'aix-voice-'));
  try {
    const pkgEntry = prepareVoiceSandbox(
      path.join(pkgRoot, 'lib/voice-input.js'),
      path.join(sandbox, 'pkg'),
    );
    const repoEntry = prepareVoiceSandbox(
      path.join(REPO_ROOT, 'apps/rokid-agent/lib/voice-input.js'),
      path.join(sandbox, 'repo'),
    );
    const pkgMod = await load(pkgEntry);
    const repoMod = await load(repoEntry);

    let same = 0;
    let correct = 0;
    for (const sc of VOICE_SCENARIOS) {
      const pkgRes = await runVoiceScenario(pkgMod, sc);
      const repoRes = await runVoiceScenario(repoMod, sc);
      if (pkgRes.error || repoRes.error) {
        problems.push(`语音场景「${sc.name}」跑不起来：${pkgRes.error || repoRes.error}`);
        continue;
      }
      if (pkgRes.value !== repoRes.value) {
        problems.push(
          `语音场景「${sc.name}」包内与仓库不一致：包内 ${JSON.stringify(pkgRes.value)}，仓库 ${JSON.stringify(repoRes.value)}`,
        );
        continue;
      }
      same++;
      if (pkgRes.value !== sc.expect) {
        problems.push(
          `语音场景「${sc.name}」结果不对：实际 ${JSON.stringify(pkgRes.value)}，期望 ${JSON.stringify(sc.expect)}`,
        );
        continue;
      }
      correct++;
    }
    checks.push(
      `语音输入 wx 宿主行为：${correct}/${VOICE_SCENARIOS.length} 个场景包内与仓库逐字一致且符合预期（包内↔仓库一致 ${same}/${VOICE_SCENARIOS.length}）`,
    );
  } finally {
    if (!process.env.AIX_KEEP_SANDBOX) {
      try {
        rmSync(sandbox, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
  return { problems, checks };
}

/**
 * 抽取「对外文案」里的中文字符串字面量。
 *
 * 为什么只抽这两块：
 *   · `<script def>` 块 —— **商店展示的工具说明与参数描述**（用户第一眼看到的东西）；
 *   · 模板区（最后一个 `</script>` 之后、`<style>` 之前）—— 界面上出现的每一句话。
 * `<script setup>` 里全是代码注释，**不能抽** —— 包内注释被压掉了，抽出来必然误报。
 *
 * 为什么用「字符串字面量」而不是「所有中文」：
 *   「资源优化 等级2」只去注释、改正则字面量里的**标识符**，
 *   **字符串字面量的内容原样保留** ⇒ 字面量可以逐字比对。
 *   而注释里的中文在包内根本不存在，抽出来会变成永远红的假警报。
 */
function extractUiLiterals(src) {
  const defEnd = src.indexOf('</script>');
  const styleStart = src.indexOf('<style>');
  const setupEnd = styleStart >= 0 ? src.lastIndexOf('</script>', styleStart) : src.lastIndexOf('</script>');
  const scope = [
    defEnd >= 0 ? src.slice(0, defEnd) : '',
    setupEnd >= 0 ? src.slice(setupEnd + '</script>'.length, styleStart >= 0 ? styleStart : src.length) : '',
  ].join('\n');
  const out = new Set();
  const re = /(["'`])((?:(?!\1)[^\\\n])*)\1/g;
  let m = re.exec(scope);
  while (m) {
    if (/[\u4e00-\u9fff]/.test(m[2])) out.add(m[2]);
    m = re.exec(scope);
  }
  return out;
}

/**
 * 核对「包内的对外文案」与「仓库里的」逐字一致。
 *
 * 为什么必须有这条（2026-11-13）：
 *   核验里原来只有一条「`index.ink` 行数一致」——
 *   它**抓不到等行数的内容变更**。
 *   本轮就撞上了：把对外说明里的「双击换生辰」改成「连点两下切换运限层」，
 *   改的是同一行 ⇒ 行数一模一样 ⇒ 旧断言全绿，
 *   而包里可能还是那句错的手势口径（会直接让用户按错手势）。
 *
 *   这条断言专治这一类：**改了字、没改行数**。
 */
/**
 * 抽出「模板区」里的中文文本片段。
 *
 * 为什么单独抽（2026-11-13 晚加）：
 *   `extractUiLiterals` 只抽 **JS 字符串字面量**，抽不到模板里的裸文本。
 *   而页面上最要命的那批对外文案 —— 盘面页提示「滑动选宫　单击问这宫　双击切层」、
 *   对话页提示「向前滑动看更早　单击开口问　双击问建议语」、
 *   以及**眼镜端免责声明** —— **全都在模板区**，一个字都不是字面量。
 *   ⇒ 光靠字面量检查，这些文案改了核验脚本看不见。
 *
 * 实测（2026-11-13）：包内模板区 11 段中文 vs 仓库 13 段，
 * 逐字对得上，唯一差异就是 review 期间新加的免责声明那一行 ⇒ 这条检查可放心用。
 */
function extractTemplateChunks(src) {
  const styleStart = src.indexOf('<style>');
  const setupEnd = src.lastIndexOf('</script>', styleStart);
  const region =
    setupEnd >= 0
      ? src.slice(setupEnd + '</script>'.length, styleStart >= 0 ? styleStart : src.length)
      : '';
  // 去掉标签，剩下的裸文本按空白切块
  const text = region.replace(/<[^>]*>/g, ' ');
  const out = new Set();
  for (const chunk of text.split(/\s+/)) {
    const s = chunk.trim();
    if (s && /[一-鿿]/.test(s)) out.add(s);
  }
  return out;
}

function checkUiLiterals(pkgRoot) {
  const pkgSrc = readFileSync(path.join(pkgRoot, 'pages/index/index.ink'), 'utf8');
  const repoSrc = readFileSync(
    path.join(REPO_ROOT, 'apps/rokid-agent/pages/index/index.ink'),
    'utf8',
  );
  const repoLiterals = [...extractUiLiterals(repoSrc)];
  const pkgLiterals = [...extractUiLiterals(pkgSrc)];
  /** 正向：仓库里有、包里没有 ⇒ 仓库改过/加过，包还是旧的 */
  const missing = repoLiterals.filter((s) => !pkgSrc.includes(s));
  /**
   * 反向（2026-11-13 晚加）：包里有、仓库里已经没有 ⇒ **包里是旧文案**。
   *
   * 为什么必须查这一边：上一轮真出过「改了字、没改行数」的 bug
   * （手势口径从「双击换生辰」改成「连点两下切运限层」）。
   * 正向检查抓不到这种「同一句话被改写」的情形 ——
   * 仓库里已经是新句子，包里是旧句子，正向看是「包里有新句子吗」→ 有（如果新句子恰好也在别处）。
   * 反向看才抓得到：**包里那句话，仓库里已经找不到了**。
   */
  const stale = pkgLiterals.filter((s) => !repoLiterals.includes(s));

  // ── 模板区（页面上真正显示的字）──
  const repoChunks = [...extractTemplateChunks(repoSrc)];
  const pkgChunks = [...extractTemplateChunks(pkgSrc)];
  const tplMissing = repoChunks.filter((s) => !pkgChunks.includes(s));
  const tplStale = pkgChunks.filter((s) => !repoChunks.includes(s));

  return {
    ok: !missing.length && !stale.length && !tplMissing.length && !tplStale.length,
    missing,
    stale,
    tplMissing,
    tplStale,
    count: repoLiterals.length + repoChunks.length,
  };
}

/** 把 checkUiLiterals 的结果拼成人读的文本 */
function formatUiLiteralsProblem(uiCheck) {
  const lines = [];
  const bullet = (arr) => arr.map((s) => `      · ${s}`).join('\n');
  if (uiCheck.missing.length) {
    lines.push(
      `包内缺 ${uiCheck.missing.length} 条仓库已有的 JS 字面量（仓库领先本版时属预期）：\n` +
        bullet(uiCheck.missing),
    );
  }
  if (uiCheck.stale.length) {
    lines.push(
      `包内还有 ${uiCheck.stale.length} 条仓库已删/已改的 JS 字面量（包里是旧文案）：\n` +
        bullet(uiCheck.stale),
    );
  }
  if (uiCheck.tplMissing.length) {
    lines.push(
      `包内模板区缺 ${uiCheck.tplMissing.length} 段仓库已有的中文（页面上显示的字，仓库领先本版时属预期）：\n` +
        bullet(uiCheck.tplMissing),
    );
  }
  if (uiCheck.tplStale.length) {
    lines.push(
      `包内模板区还有 ${uiCheck.tplStale.length} 段仓库已删/已改的中文（页面上显示的旧文案）：\n` +
        bullet(uiCheck.tplStale),
    );
  }
  return lines.join('\n');
}

/**
 * 比对「包内的模块」与「仓库里的模块」行为是否一致。
 * 包内代码被「资源优化 等级2」压过（去注释、去空白、部分改名），
 * 字节比不了 —— 只能比行为。
 */
async function compareBehaviour(pkgRoot) {
  const problems = [];
  const checks = [];

  // ── 出生参数三级兜底 ──
  const pkgBirth = await load(path.join(pkgRoot, 'lib/birth-source.js'));
  const repoBirth = await load(path.join(REPO_ROOT, 'apps/rokid-agent/lib/birth-source.js'));
  let birthOk = 0;
  for (const c of BIRTH_CASES) {
    const a = pkgBirth.resolveInitialBirth(c.query, c.saved);
    const b = repoBirth.resolveInitialBirth(c.query, c.saved);
    if (!deepEqual(a, b)) {
      problems.push(
        `birth-source 行为不一致：query=${JSON.stringify(c.query)} saved=${JSON.stringify(c.saved)}\n` +
          `    包内：${JSON.stringify(a)}\n    仓库：${JSON.stringify(b)}`,
      );
    } else {
      birthOk++;
    }
  }
  checks.push(`出生参数三级兜底：${birthOk}/${BIRTH_CASES.length} 组输入输出完全一致`);

  // ── 端侧引擎：排盘 + 运限三层 + 晚子时口径 ──
  const pkgEngine = await load(path.join(pkgRoot, 'assets/engine.js'));
  const repoEngine = await load(path.join(REPO_ROOT, 'apps/rokid-agent/assets/engine.js'));
  let engineOk = 0;
  for (const b of ENGINE_CASES) {
    const a = pkgEngine.chart(b);
    const e = repoEngine.chart(b);
    if (!deepEqual(a, e)) {
      problems.push(`引擎排盘结果不一致：${JSON.stringify(b)}`);
      continue;
    }
    // 运限三层也一起比
    const dxPalace = e.palaces.find((p) => p.isCurrentDaXian);
    const dxIndex = dxPalace ? e.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch) : -1;
    const layers = [
      ['daXianLayer', [a, dxIndex]],
      ['liuNianLayer', [a, 2026]],
      ['liuYueLayer', [a, 2026, 9]],
    ];
    for (const [fn, args] of layers) {
      if (typeof pkgEngine[fn] !== 'function') {
        problems.push(`包内引擎缺少导出 ${fn}`);
        break;
      }
      if (!deepEqual(pkgEngine[fn](...args), repoEngine[fn](...args))) {
        problems.push(`引擎 ${fn} 结果不一致：${JSON.stringify(b)}`);
        break;
      }
    }
    engineOk++;
  }
  checks.push(`端侧引擎排盘 + 运限三层：${engineOk}/${ENGINE_CASES.length} 例逐字段一致`);

  // ── 晚子时口径 ──
  if (!deepEqual(pkgEngine.resolveChartDate(1990, 1, 1, 23, 30), { year: 1990, month: 1, day: 2, hour: 0 })) {
    problems.push('包内引擎晚子时口径不对（23:30 应按次日 00 时排盘）');
  } else {
    checks.push('晚子时口径一致（23:30 → 次日 00 时）');
  }

  // ── 布局函数 ──
  const pkgLayout = await load(path.join(pkgRoot, 'lib/chart-layout.js'));
  const repoLayout = await load(path.join(REPO_ROOT, 'apps/rokid-agent/lib/chart-layout.js'));
  if (!deepEqual(pkgLayout.stepRing ? pkgLayout.stepRing(0, 1) : null, repoLayout.stepRing(0, 1))) {
    problems.push('布局模块 stepRing 行为不一致');
  } else {
    checks.push('十二宫外圈巡宫（stepRing）行为一致');
  }

  // ── 语音输入：wx 宿主契约 + 空结果不清空 + 硬超时 ──
  const voice = await compareVoiceInput(pkgRoot);
  problems.push(...voice.problems);
  checks.push(...voice.checks);

  return { problems, checks };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    console.log('已知 AIX 包：');
    for (const p of KNOWN_PACKAGES) {
      console.log(`  [${p.current ? '当前' : '历史'}] ${p.file}`);
      console.log(`        ${p.note}`);
      if (p.md5) console.log(`        MD5 ${p.md5}`);
      console.log(`        ${CDN}/${p.file}`);
    }
    return;
  }

  const pkg =
    KNOWN_PACKAGES.find((p) => p.key === args.pkgKey) ?? KNOWN_PACKAGES.find((p) => p.current);
  const url = args.url ?? `${CDN}/${pkg.file}`;
  const expectMd5 = args.expectMd5 ?? pkg.md5;

  console.log('AIX 取包与核验');
  console.log('='.repeat(68));
  console.log(`地址   ${url}`);
  console.log(`期望   ${expectMd5 ? `MD5 ${expectMd5}` : '（未指定 MD5，不校验）'}`);

  const buffer = await download(url);
  const gotMd5 = md5(buffer);
  const gotSha = sha256(buffer);
  console.log(`大小   ${buffer.length} 字节（${(buffer.length / 1024 / 1024).toFixed(2)} MB）`);
  console.log(`MD5    ${gotMd5}`);
  console.log(`SHA256 ${gotSha}`);

  if (expectMd5 && gotMd5 !== expectMd5) {
    console.error(`\n✗ MD5 不符：期望 ${expectMd5}，实际 ${gotMd5}`);
    process.exit(1);
  }
  console.log('✓ MD5 对账通过');

  const work = mkdtempSync(path.join(tmpdir(), 'aix-verify-'));
  try {
    const root = unzip(buffer, work);
    console.log(`\n解包   ${root}`);

    /**
     * ⚠️ 所有失败项**收集齐再一起报**，不要遇到第一个就 exit。
     *
     * 为什么：核验这个脚本的价值一半在「一次跑完看到全部问题」。
     * 早先的写法是「行数不符 → 立刻 exit」，
     * 于是拿旧包试跑时**只看得到行数不符**，
     * 后面那些更有信息量的断言（语音行为不一致）根本没机会显示。
     * 现在改成收集制：一次跑完，红项全列出来。
     */
    const failures = [];
    const warnings = [];

    // ── 关键文件必须在包里 ──
    const required = [
      'app.json',
      'app.js',
      'pages/index/index.ink',
      'lib/birth-source.js',
      'lib/chart-layout.js',
      'lib/chart-source.js',
      'lib/api.js',
      'assets/engine.js',
      'META-INF/aix/manifest.json',
    ];
    const missing = required.filter((f) => !existsSync(path.join(root, f)));
    if (missing.length) {
      failures.push(`包内缺文件：${missing.join('、')}`);
    } else {
      console.log(`✓ 关键文件齐备（${required.length} 项）`);
    }

    /**
     * ── index.ink 行数：包内 vs 仓库 ──
     *
     * ⚠ **三态**，不是两态（2026-11-13 晚 review 后改）：
     *   ① 包内 == 仓库                        → ✓ 一致
     *   ② 包内 == 已发布基线 && 仓库 > 基线   → ⚠「仓库领先本版」（本地改了、还没重打包）
     *   ③ 其余                                 → ✗ 失败（装错包 / 仓库被回退）
     *
     * 为什么要 ②：改 index.ink（比如补眼镜端免责声明）之后，仓库必然领先已发布的 v1.0.20。
     * 老的两态写法把这个**预期状态**判成失败 ⇒ 每改一行代码核验脚本就假红一次，
     * 真失败反而被淹没（这正是本轮差点发生的事）。
     * 而 ③ 必须保留鉴别力：拿旧包（v1.0.18 等）来跑核验一定要红。
     */
    let repoAhead = false;
    if (!missing.length) {
      const pkgInkLines = readFileSync(path.join(root, 'pages/index/index.ink'), 'utf8').split('\n').length;
      const repoInkLines = readFileSync(
        path.join(REPO_ROOT, 'apps/rokid-agent/pages/index/index.ink'),
        'utf8',
      ).split('\n').length;
      const baseline = pkg.inkLines ?? null;
      if (pkgInkLines === repoInkLines) {
        console.log(`✓ index.ink 行数一致（${pkgInkLines}）`);
      } else if (baseline !== null && pkgInkLines === baseline && repoInkLines > baseline) {
        repoAhead = true;
        console.log(
          `⚠ 仓库领先本版：包内 ${pkgInkLines} 行（= 已发布基线 ${baseline}），仓库 ${repoInkLines} 行` +
            ` —— 本地代码已改、尚未重打包（预期状态，不算失败）`,
        );
      } else if (pkgInkLines > repoInkLines) {
        failures.push(
          `index.ink 行数不一致：包内 ${pkgInkLines} > 仓库 ${repoInkLines} —— 包比仓库还新（仓库被回退了？）`,
        );
      } else {
        failures.push(
          `index.ink 行数不一致：包内 ${pkgInkLines}，仓库 ${repoInkLines} —— 包不是最新代码`,
        );
      }
    }

    // ── 追问超时必须一致（证明包里带了 2026-11-08 的超时修复）──
    const askCheck = checkAskTimeout(root);
    if (!askCheck.ok) {
      // soft 的差异在「仓库领先本版」时只是预期状态，不是装错包
      (askCheck.soft && repoAhead ? warnings : failures).push(askCheck.message);
    } else {
      console.log(`✓ 追问超时一致（${askCheck.value}ms）—— 包里带了超时修复`);
    }

    // ── 对外文案必须逐字一致（专治「改了字、没改行数」）──
    const uiCheck = checkUiLiterals(root);
    if (!uiCheck.ok) {
      (repoAhead ? warnings : failures).push(formatUiLiteralsProblem(uiCheck));
    } else {
      console.log(
        `✓ 对外文案逐字一致（${uiCheck.count} 条中文文本：JS 字面量 + 模板区）—— 包里带的说明与仓库一致`,
      );
    }

    // ── 行为等价 ──
    const { problems, checks } = await compareBehaviour(root);
    console.log('');
    for (const c of checks) console.log(`✓ ${c}`);
    (repoAhead ? warnings : failures).push(...problems);

    if (warnings.length) {
      console.warn(`\n⚠ ${warnings.length} 处告警（不判失败）：`);
      for (const w of warnings) console.warn(`  · ${w}`);
      if (repoAhead) {
        console.warn(
          `\n  ⓘ 上面这些差异来自「仓库比已发布包领先」—— 本地代码已改但还没重打包。` +
            `\n     已发布的 ${pkg.file} 仍是当前唯一该装到眼镜上的版本。`,
        );
      }
    }

    if (failures.length) {
      console.error(`\n✗ 核验发现 ${failures.length} 处问题：`);
      for (const p of failures) console.error(`  · ${p}`);
      process.exit(1);
    }
    console.log(
      repoAhead
        ? '\n✓ 包内代码 = 当前已发布版本；仓库有尚未打包的新改动（不算失败）'
        : '\n✓ 包内代码与仓库源码行为完全一致 —— 包里就是最新代码',
    );

    // ── 留一份到 gitignore 的目录，方便真机调试前先下载本地 ──
    if (!existsSync(OUT_DIR)) {
      execFileSync('mkdir', ['-p', OUT_DIR]);
    }
    const saved = path.join(OUT_DIR, path.basename(new URL(url).pathname));
    writeFileSync(saved, buffer);
    console.log(`\n留档   ${saved}`);

    console.log('\n' + '='.repeat(68));
    console.log('✅ AIX 核验通过');
  } finally {
    if (!args.keep) rmSync(work, { recursive: true, force: true });
    else console.log(`\n（--keep：解包目录保留在 ${work}）`);
  }
}

main().catch((err) => {
  console.error(`\n✗ ${err?.stack || err}`);
  process.exit(1);
});
