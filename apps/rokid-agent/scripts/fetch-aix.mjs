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
 * 本脚本做四件事，任何一件不过就退出码非 0：
 *   1. 下载 AIX（也可传 --url 直接给地址），校验 MD5（给了 --expect-md5 才校验）
 *   2. 解包，逐项核对 manifest 里的 sha256
 *   3. **行为等价比对**：把**包内**的引擎与出生参数模块，跟**仓库里**的跑同一批输入，
 *      输出必须逐字段一致 —— 这才是「包里是最新代码」的硬证据
 *      （包内代码被「资源优化 等级2」压过，字节比不了，只能比行为）
 *   4. 核对关键文件确实在包里：index.ink、lib/birth-source.js、assets/engine.js
 *
 * 用法：
 *   node apps/rokid-agent/scripts/fetch-aix.mjs                     # 拉「当前版」
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --list              # 只看已知包清单
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --url <url> --expect-md5 <md5>
 *   node apps/rokid-agent/scripts/fetch-aix.mjs --keep               # 保留解包目录
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    file: `${AGENT_ID}-1794136722831.aix`,
    md5: '676f6c4f6d1bcbed5fa756e6024b8cfc',
    note: '2026-11-08 19:19 重打，8.63 MB；含追问超时修复（120s）+ 端侧引擎 Intl.PluralRules 兜底（模块作用域遮蔽版）+ **时辰入口改造**（提示改口语、缺时辰落午时并标估算、修掉「解析成功浮层不关」致命 bug）',
    current: true,
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
      console.error(`\n✗ 包内缺文件：${missing.join('、')}`);
      process.exit(1);
    }
    console.log(`✓ 关键文件齐备（${required.length} 项）`);

    // ── index.ink 行数必须和仓库一致 ──
    const pkgInkLines = readFileSync(path.join(root, 'pages/index/index.ink'), 'utf8').split('\n').length;
    const repoInkLines = readFileSync(
      path.join(REPO_ROOT, 'apps/rokid-agent/pages/index/index.ink'),
      'utf8',
    ).split('\n').length;
    if (pkgInkLines !== repoInkLines) {
      console.error(`\n✗ index.ink 行数不一致：包内 ${pkgInkLines}，仓库 ${repoInkLines} —— 包不是最新代码`);
      process.exit(1);
    }
    console.log(`✓ index.ink 行数一致（${pkgInkLines}）`);

    // ── 追问超时必须一致（证明包里带了 2026-11-08 的超时修复）──
    const askCheck = checkAskTimeout(root);
    if (!askCheck.ok) {
      console.error(`\n✗ ${askCheck.message}`);
      process.exit(1);
    }
    console.log(`✓ 追问超时一致（${askCheck.value}ms）—— 包里带了超时修复`);

    // ── 行为等价 ──
    const { problems, checks } = await compareBehaviour(root);
    console.log('');
    for (const c of checks) console.log(`✓ ${c}`);
    if (problems.length) {
      console.error(`\n✗ 行为比对发现 ${problems.length} 处不一致：`);
      for (const p of problems) console.error(`  · ${p}`);
      process.exit(1);
    }
    console.log('\n✓ 包内代码与仓库源码行为完全一致 —— 包里就是最新代码');

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
