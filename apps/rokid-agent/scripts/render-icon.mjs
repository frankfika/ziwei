#!/usr/bin/env node
/**
 * 把 SVG 渲染成 PNG（AIUI Studio 提审用智能体图标）。
 *
 * 为什么不用 ImageMagick：它的内置 MSVG 渲染器不支持 gradient —— 实测
 * `radialGradient` 背景被渲成纯黑、渐变填充的四芒星整块消失。
 * 改用 chromium（和策划案 PDF 同一套工具链），渲染结果与浏览器里一致。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/render-icon.mjs
 *   node apps/rokid-agent/scripts/render-icon.mjs --src <svg> --out-dir <dir> --sizes 1024,512,256
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { AGENT_ROOT } from './forbidden-terms.mjs';

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(join(root, 'noop.js'))(name);
}

async function main() {
  const arg = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };

  const src = arg('--src', join(AGENT_ROOT, 'submit-kit/icon/icon.svg'));
  const outDir = arg('--out-dir', join(AGENT_ROOT, 'submit-kit/icon'));
  const sizes = arg('--sizes', '1024,512,256')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!existsSync(src)) {
    console.error(`✗ 找不到源文件：${src}`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const { chromium } = requireGlobal('playwright');
  const browser = await chromium.launch();
  try {
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.goto(`file://${src}`, { waitUntil: 'networkidle' });
      // SVG 自带 viewBox，按视口铺满
      await page.evaluate(() => {
        const s = document.querySelector('svg');
        if (s) {
          s.setAttribute('width', '100%');
          s.setAttribute('height', '100%');
        }
        // 直接打开 .svg 时文档里没有 <body>，根元素就是 <svg>，body 为 null
        if (document.body) {
          document.body.style.margin = '0';
          document.body.style.background = 'transparent';
        }
        document.documentElement.style.background = 'transparent';
      });
      const out = join(outDir, `icon-${size}.png`);
      await page.screenshot({ path: out, omitBackground: true });
      await page.close();
      console.log(`✓ ${out}  ${(statSync(out).size / 1024).toFixed(1)} KB`);
    }
  } finally {
    await browser.close();
  }
  console.log(`（源文件 ${basename(src)}）`);
}

main().catch((err) => {
  console.error('✗ 渲染失败：', err.message);
  process.exit(1);
});
