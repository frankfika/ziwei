#!/usr/bin/env node
/**
 * 把 @ziwei/chart-engine 打成**单文件 ESM 模块**，塞进 AIUI 智能体。
 *
 * 为什么必须打包：
 *  · AIUI 工程不允许装第三方 npm 包（社区实战：「整个应用没有引入任何第三方 npm 包」），
 *    而排盘引擎依赖 iztro + lunar-javascript。
 *  · 眼镜端不能直接读仓库源码（没有 tsx、没有 node_modules）。
 *  · 打包产物是**可复现**的：同一份源码 → 同一份产物，由 tests/rokid_agent.test.ts
 *    用 9 份金标准盘逐字段比对，保证「打包不失真」。
 *
 * 产物：assets/engine.js（ESM，具名导出 chart / chartSummary / palaceAt / ...）
 *
 * 用法：
 *   node apps/rokid-agent/scripts/build-engine.mjs
 *   node apps/rokid-agent/scripts/build-engine.mjs --check   # 只校验产物是否与源码一致
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** AIUI 工程根目录 */
export const AGENT_ROOT = path.resolve(HERE, '..');
/** 仓库根目录 */
export const REPO_ROOT = path.resolve(AGENT_ROOT, '..', '..');
/** 引擎入口（源码） */
export const ENGINE_ENTRY = path.join(REPO_ROOT, 'packages', 'chart-engine', 'src', 'index.ts');
/** 打包产物 */
export const ENGINE_OUT = path.join(AGENT_ROOT, 'assets', 'engine.js');

/** 打包参数 —— 与产物指纹一起写进 banner，改参数即改指纹 */
export const BUILD_OPTIONS = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
};

/** esbuild 可执行文件 */
function esbuildBin() {
  const local = path.join(REPO_ROOT, 'node_modules', '.bin', 'esbuild');
  if (fs.existsSync(local)) return local;
  return 'esbuild';
}

/** 产物 banner —— 带指纹，方便在真机/提审材料里核对用的是哪份产物 */
export function banner(sha256) {
  return [
    '/*',
    ' * 紫微星盘 · 端侧排盘引擎（自动生成，勿手改）',
    ' *',
    ' * 来源：packages/chart-engine（vendored 自 https://github.com/Renhuai123/ziwei-doushu，MIT）',
    ' * 生成：node apps/rokid-agent/scripts/build-engine.mjs',
    ` * 指纹：sha256:${sha256}`,
    ' *',
    ' * 署名义务见 ATTRIBUTION.md：数据集 CC BY 4.0 / 作者 王多鱼AI；引擎代码 MIT。',
    ' */',
    '',
  ].join('\n');
}

/**
 * 跑一次打包，返回产物内容。
 *
 * @returns {Promise<string>} 打包后的 JS 源码
 */
export async function buildEngine() {
  const outfile = ENGINE_OUT;
  fs.mkdirSync(path.dirname(outfile), { recursive: true });

  const args = [
    ENGINE_ENTRY,
    '--bundle',
    `--format=${BUILD_OPTIONS.format}`,
    `--platform=${BUILD_OPTIONS.platform}`,
    `--target=${BUILD_OPTIONS.target}`,
    '--minify',
    '--legal-comments=none',
    `--outfile=${outfile}`,
    '--log-level=warning',
  ];

  // execFileSync 是同步的：打包失败直接抛，不要吞
  execFileSync(esbuildBin(), args, { stdio: 'inherit' });

  const body = fs.readFileSync(outfile, 'utf8');
  const sha256 = createHash('sha256').update(body).digest('hex');
  const withBanner = banner(sha256) + body;
  fs.writeFileSync(outfile, withBanner, 'utf8');
  return withBanner;
}

/** banner 结束标记 —— 指纹只覆盖 banner 之后的正文 */
const BANNER_END = '*/\n';

/**
 * 产物指纹（对**正文**计算，不含 banner —— banner 里就写着这个值）。
 *
 * @returns {string} sha256 十六进制
 */
export function engineFingerprint() {
  const content = fs.readFileSync(ENGINE_OUT, 'utf8');
  const idx = content.indexOf(BANNER_END);
  const body = idx >= 0 ? content.slice(idx + BANNER_END.length) : content;
  return createHash('sha256').update(body).digest('hex');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const check = process.argv.includes('--check');
  if (check) {
    if (!fs.existsSync(ENGINE_OUT)) {
      console.error(`✗ 产物不存在：${ENGINE_OUT}\n  请先跑：node apps/rokid-agent/scripts/build-engine.mjs`);
      process.exit(1);
    }
    console.log(`产物指纹：sha256:${engineFingerprint()}`);
    console.log(`产物大小：${(fs.statSync(ENGINE_OUT).size / 1024).toFixed(1)} KB`);
  } else {
    await buildEngine();
    console.log(`✓ 已生成 ${path.relative(REPO_ROOT, ENGINE_OUT)}（${(fs.statSync(ENGINE_OUT).size / 1024).toFixed(1)} KB）`);
    console.log(`  指纹 sha256:${engineFingerprint()}`);
  }
}
