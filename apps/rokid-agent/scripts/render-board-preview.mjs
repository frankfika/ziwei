#!/usr/bin/env node
/**
 * 生成眼镜端 480×352 盘面预览图（PNG）。
 *
 * 用途：初赛材料里的「PPT 作品信息介绍」需要产品画面，但真机未到 ——
 *      这张图是**模拟器渲染**（真实引擎数据 + 真实布局函数 + 真实 Ink 样式），
 *      不是真机截图。对外使用时必须标注「模拟器渲染」，不能冒充真机照片。
 *
 * 画面不是手绘的：宫位、主星、安星、五行局、大限全部来自 `assets/engine.js`
 * 的真实排盘结果，格子坐标来自 `lib/chart-layout.js` 的 `buildBoard`，
 * 样式直接取自 `pages/index/index.ink` 的 `<style>` 段 —— 改一处，渲染跟着改。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/render-board-preview.mjs
 *   node apps/rokid-agent/scripts/render-board-preview.mjs --layer natal --scale 3
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AGENT_ROOT } from './forbidden-terms.mjs';

const REPO = path.resolve(AGENT_ROOT, '..', '..');
const load = (p) => import(pathToFileURL(p).href);

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(path.join(root, 'noop.js'))(name);
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

async function main() {
  const layer = arg('--layer', 'liunian'); // natal | daxian | liunian | liuyue
  const scale = Number(arg('--scale', '3'));
  const outDir = path.join(AGENT_ROOT, 'submit-kit', 'preview');
  fs.mkdirSync(outDir, { recursive: true });

  const ink = fs.readFileSync(path.join(REPO, 'apps/rokid-agent/pages/index/index.ink'), 'utf8');
  const style = ink.slice(ink.indexOf('<style>') + 7, ink.indexOf('</style>'));

  const engine = await load(path.join(REPO, 'apps/rokid-agent/assets/engine.js'));
  const layout = await load(path.join(REPO, 'apps/rokid-agent/lib/chart-layout.js'));
  const tl = await load(path.join(REPO, 'apps/rokid-agent/lib/time-layer.js'));

  const birth = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' };
  const chart = engine.chart(birth);
  const layers = tl.buildTimeLayers(chart, engine, { now: new Date(2026, 10, 6) });
  const fortune = layer === 'natal' ? null : layers[layer];
  const board = layout.buildBoard(chart, fortune);
  const cells = layout.markActive(board.cells, chart.mingGongBranch);

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const cellHtml = cells
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

  const active = board.cells.find((c) => c.branch === chart.mingGongBranch);
  const activeCell = cells.find((c) => c.branch === chart.mingGongBranch);

  const centerHtml = `    <view class="center">
    <text class="center-title">${esc(fortune ? fortune.label : '本命盘')}</text>
    <text class="center-line">命主 ${esc(board.center.mingZhu)}　身主 ${esc(board.center.shenZhu)}</text>
    <text class="center-line dim">${esc(fortune ? `本层命宫落 ${fortune.mingPalaceName}` : `${board.center.yinYangGender}　${board.center.wuxingJuName}`)}</text>
    <text class="center-line dim">${esc(fortune ? tl.fortuneSiHuaText(fortune) : board.center.lunarText)}</text>
    <text class="center-line dim">${esc(board.center.pillarsText)}</text>
    <view class="center-divider"></view>
    <view class="selected-row">
      <text class="center-line strong">${esc(activeCell?.name ?? '')}</text>
      <text class="center-role">${esc(activeCell?.fortuneShort ?? '')}</text>
    </view>
    <text class="center-hint">确认键听解读　左右选宫　上下切层</text>
    <text class="center-hint dim">头部准星　端侧计算</text>
  </view>`;

  const html = `<!doctype html><html><head><meta charset="utf-8">
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

  const htmlPath = path.join(outDir, `board-${layer}.html`);
  fs.writeFileSync(htmlPath, html, 'utf8');

  const { chromium } = requireGlobal('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 480, height: 352 },
      deviceScaleFactor: scale,
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
    const png = path.join(outDir, `board-${layer}.png`);
    await page.screenshot({ path: png });
    console.log(`✓ ${png}`);
    console.log(`  层: ${fortune ? fortune.label : '本命盘'}｜选中宫: ${activeCell?.name ?? ''}｜运限小标: ${cells.filter((c) => c.fortuneShort).length} 个`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('✗ 生成失败：', err.message);
  process.exit(1);
});
