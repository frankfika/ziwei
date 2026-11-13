/**
 * 预览渲染共享层 —— 把 `pages/index/index.ink` 的三屏 HTML 化。
 *
 * 为什么单独抽出来：
 *   `simulate-first-launch.mjs`（产出 PNG）与 `render-preview-video.mjs`（产出 MP4）
 *   都要把页面状态画成浏览器能渲染的 HTML。页面模板一改（第二十五轮把
 *   「三个整屏浮窗」改成「盘面页 + 对话页 + 录入页」），两个脚本都会同时坏。
 *   各写一份 = 两处漂移 = 有一处悄悄渲染出「文档里的界面」而不是「眼镜上的界面」。
 *   ⇒ 合成一个模块，改一处，两边一起跟着变。
 *
 * 规矩（与仓库其他渲染脚本一致）：
 *   · 样式段**原样**取自 `index.ink` 的 `<style>`，不重写 CSS；
 *   · 结构与 `index.ink` 的模板**一一对应**，字段名用页面 `data` 里的真名；
 *   · 数据来自**真实页面状态**（`page.data`），不是这里编的假数据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { AGENT_ROOT } from './forbidden-terms.mjs';
import { viewRows } from '../lib/chat-store.js';

const INK_PAGE = path.join(AGENT_ROOT, 'pages', 'index', 'index.ink');

/**
 * 读取 `index.ink` 的 `<style>` 段。
 *
 * @returns {string}
 */
export function readStyle() {
  const ink = fs.readFileSync(INK_PAGE, 'utf8');
  return ink.slice(ink.indexOf('<style>') + 7, ink.indexOf('</style>'));
}

/**
 * HTML 转义。属性值里也要转义引号（class="..." 会用到）。
 *
 * @param {unknown} s
 * @returns {string}
 */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 一段 HTML 文档的公共外壳（样式 + 单色绿黑底） */
function doc(style, inner) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${style}
view, text, scroll-view { display: block; }
text { display: inline; }
page { display: block; }
html, body { margin: 0; padding: 0; background: #000; }
</style></head><body>
${inner}
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * 盘面页
 * ------------------------------------------------------------------ */

/**
 * 十二宫格（盘面页与对话页共用同一份格子结构）。
 *
 * @param {Array<Object>} cells
 * @returns {string}
 */
export function cellsHtml(cells) {
  return (cells || [])
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
}

/**
 * 中宫 = **常驻对话区**。
 *
 * 这一版最要紧的改动：这里不再是「命主/身主/阴阳男女」的静态数据区，
 * 而是焦点行 + 最近一问一答 + 引导语/建议语。
 *
 * @param {Object} d 页面 data
 * @returns {string}
 */
export function centerHtml(d) {
  const digestHtml = d.digestQuestion
    ? `      <text class="digest-q">${esc(d.digestQuestion)}</text>
      <text class="digest-a">${esc(d.digestAnswer)}</text>`
    : `      <text class="digest-lead">${esc(d.digestLead)}</text>
      <text class="center-suggest">试试问：${esc(d.suggestionText)}</text>`;

  return `    <view class="center">
      <view class="center-top">
        <text class="focus-line">${esc(d.focusLine)}</text>
        ${d.focusDetail ? `<text class="focus-detail">${esc(d.focusDetail)}</text>` : ''}
      </view>
      <view class="center-divider"></view>
      <view class="center-mid">
${digestHtml}
      </view>
      <view class="center-bottom">
${d.noticeLabel ? `        <text class="center-hint demo">${esc(d.noticeLabel)}</text>` : ''}
        <text class="center-hint">${esc(d.hintLine)}</text>
        ${d.statusLine ? `        <text class="center-hint dim">${esc(d.statusLine)}</text>` : ''}
      </view>
    </view>`;
}

/**
 * 盘面页 HTML。
 *
 * @param {Object} d 页面 data
 * @param {string} style
 * @returns {string}
 */
export function renderBoardHtml(d, style) {
  return doc(
    style,
    `  <view class="board">
${cellsHtml(d.cells)}
${centerHtml(d)}
  </view>`,
  );
}

/* ------------------------------------------------------------------ *
 * 对话页
 * ------------------------------------------------------------------ */

/**
 * 会话流 → 扁平的渲染行。
 *
 * ⚠️ **必须复用页面同一份逻辑**（`lib/chat-store.js` 的 viewRows）：
 * 各写一份必然漂移 —— 漂移的结果是「文档里的界面」和「眼镜上的界面」不是一回事，
 * 而提审素材恰恰是要给人看的界面。
 *
 * @param {Array<Object>} turns 视图模型或内部轮次
 * @returns {string}
 */
export function turnsHtml(turns) {
  return viewRows(turns || [])
    .map(
      (r) => `      <view class="row">
        <text class="${esc(r.cls)}">${esc(r.text)}</text>
      </view>`
    )
    .join('\n');
}

/**
 * 空态：告诉用户这里能说话，并给出不依赖识别的建议语。
 *
 * @param {Object} d
 * @returns {string}
 */
export function chatEmptyHtml(d) {
  if ((d.chatTurns || []).length) return '';
  return `      <view class="chat-empty">
        <text class="chat-empty-title">${esc(d.chatEmptyTitle)}</text>
        <text class="chat-empty-sub">单击镜腿开口问　双击直接问建议语</text>
        <text class="chat-empty-format">说生辰：1990年1月1日 早上 男</text>
        <view class="chat-sug">
${(d.suggestions || [])
  .map((s) => `          <text class="chat-sug-item">${esc(s)}</text>`)
  .join('\n')}
        </view>
      </view>`;
}

/**
 * 对话页 HTML：顶部盘面缩略带 + 会话流 + 页脚。
 *
 * @param {Object} d 页面 data
 * @param {string} style
 * @param {{ innerClass?: string }} [opts] `innerClass` 会在会话流里多包一层，
 *   供视频脚本做滚动（默认**不包**，输出与设备模板逐字一致）
 * @returns {string}
 */
export function renderChatHtml(d, style, opts = {}) {
  const stripHtml = (d.stripCells || [])
    .map((c) => `        <text class="strip-cell ${c.activeClass}">${esc(c.short)}</text>`)
    .join('\n');
  const innerOpen = opts.innerClass ? `    <view class="${opts.innerClass}">` : '';
  const innerClose = opts.innerClass ? '    </view>' : '';

  return doc(
    style,
    `  <view class="chat">
    <view class="strip">
      <view class="strip-head">
        <text class="strip-title">${esc(d.layerTitle)}</text>
        <text class="strip-focus">${esc(d.selectedName)}</text>
      </view>
      <view class="strip-row">
${stripHtml}
      </view>
    </view>
    <scroll-view class="chat-scroll">
${innerOpen}
${turnsHtml(d.chatTurns)}
${chatEmptyHtml(d)}
${innerClose}
    </scroll-view>
    <view class="chat-foot">
      <text class="foot-hint">${esc(d.hintLine)}</text>
      ${d.footStatus ? `      <text class="foot-status">${esc(d.footStatus)}</text>` : ''}
    </view>
  </view>`,
  );
}

/* ------------------------------------------------------------------ *
 * 生辰录入页
 * ------------------------------------------------------------------ */

/**
 * 录入页 HTML。
 *
 * @param {Object} d
 * @param {string} style
 * @returns {string}
 */
export function renderInputHtml(d, style) {
  return doc(
    style,
    `  <view class="overlay">
    <text class="overlay-title">说出你的生辰</text>
    <text class="overlay-body">${esc(d.voiceHint)}</text>
    ${d.heardText ? `    <text class="overlay-body strong">${esc(d.heardText)}</text>` : ''}
    <text class="overlay-body dim">格式：1990年1月1日 早上 男　不知道时辰就说「不知道时辰」</text>
    ${d.errorText ? `    <text class="overlay-body error">${esc(d.errorText)}</text>` : ''}
    <text class="overlay-hint">${esc(d.hintLine)}</text>
  </view>`,
  );
}
