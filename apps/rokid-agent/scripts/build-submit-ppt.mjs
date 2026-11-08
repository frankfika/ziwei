#!/usr/bin/env node
/**
 * 生成初赛材料里的「作品信息介绍 PPT」（赛事要求：必填，≤1GB）。
 *
 * 内容口径全部来自 `PROPOSAL.md` 与工程实测数据，不写没有依据的数字。
 * 盘面截图来自 `scripts/render-board-preview.mjs` —— **模拟器渲染**（真实引擎数据 +
 * 真实布局 + 真实 Ink 样式），不是真机照片；图上与本页都标注了这一点。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/build-submit-ppt.mjs
 *   node apps/rokid-agent/scripts/build-submit-ppt.mjs --out <path>
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { AGENT_ROOT } from './forbidden-terms.mjs';

function requireGlobal(name) {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return createRequire(join(root, 'noop.js'))(name);
}

const INK = '0A0F1C';
const INK2 = '111834';
const PURPLE = 'A793FF';
const GREEN = '2FBF71';
const WHITE = 'F2F4F8';
const DIM = '9AA3B8';
// 跨平台字体：PingFang SC 只在 macOS 有，Windows/WPS 会掉字体；
// 微软雅黑是 Windows 系统自带、Office for Mac / WPS 也带的通用中文名。
const FONT = 'Microsoft YaHei';

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

async function main() {
  const outPath = arg('--out', join(AGENT_ROOT, 'submit-kit', 'ppt', '紫微星盘-作品信息介绍.pptx'));
  const previewDir = join(AGENT_ROOT, 'submit-kit', 'preview');
  const boardLiunian = join(previewDir, 'board-liunian.png');
  const boardNatal = join(previewDir, 'board-natal.png');
  const iconPath = join(AGENT_ROOT, 'submit-kit', 'icon', 'icon-512.png');

  for (const p of [boardLiunian, boardNatal, iconPath]) {
    if (!existsSync(p)) {
      console.error(`✗ 缺素材：${p}\n  先跑 npm run board:preview 与 npm run icon:render`);
      process.exit(1);
    }
  }

  const pptxgen = requireGlobal('pptxgenjs');
  const pptx = new pptxgen();
  // 注意：pptxgenjs 的 LAYOUT_16x9 是 10 × 5.625 英寸，不是 13.333 × 7.5。
  // 排版按 13.333 × 7.5 写就必须用 LAYOUT_WIDE，否则整份内容溢出页面。
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in
  pptx.author = '陈放 Frank / 紫微助手';
  pptx.title = '紫微星盘 · 作品信息介绍';

  const W = 13.333;
  const H = 7.5;

  function bg(slide) {
    slide.background = { color: INK };
    slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.06, fill: { color: GREEN }, line: { type: 'none' } });
  }
  function title(slide, kicker, heading, sub) {
    slide.addText(kicker, { x: 0.72, y: 0.5, w: 11.9, h: 0.3, fontFace: FONT, fontSize: 11, color: GREEN, charSpacing: 2 });
    slide.addText(heading, { x: 0.72, y: 0.82, w: 11.9, h: 0.62, fontFace: FONT, fontSize: 27, bold: true, color: WHITE });
    if (sub) slide.addText(sub, { x: 0.72, y: 1.46, w: 11.9, h: 0.42, fontFace: FONT, fontSize: 12.5, color: DIM });
    slide.addShape('line', { x: 0.72, y: 1.96, w: 11.9, h: 0, line: { color: '2A3457', width: 1 } });
  }
  function foot(slide, n) {
    slide.addText('紫微星盘 · Rokid Spatial Joy 2026 · Rokid AI 赛道', {
      x: 0.72, y: H - 0.52, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: '5B6480',
    });
    slide.addText(String(n).padStart(2, '0'), {
      x: W - 1.5, y: H - 0.52, w: 0.78, h: 0.3, fontFace: FONT, fontSize: 9, color: '5B6480', align: 'right',
    });
  }
  function bullets(slide, items, opt = {}) {
    const x = opt.x ?? 0.72;
    const y = opt.y ?? 2.3;
    const w = opt.w ?? 11.9;
    const h = opt.h ?? 4.2;
    const fs = opt.fontSize ?? 14;
    slide.addText(
      items.map((t) =>
        typeof t === 'string'
          ? { text: t, options: { bullet: { code: '25AA', indent: 14 }, color: WHITE, fontSize: fs, paraSpaceAfter: opt.gap ?? 12 } }
          : { text: t.text, options: { bullet: t.sub ? false : { code: '25AA', indent: 14 }, indentLevel: t.sub ? 1 : 0, color: t.sub ? DIM : WHITE, fontSize: t.sub ? fs - 2 : fs, paraSpaceAfter: opt.gap ?? 12, bold: !!t.bold } },
      ),
      { x, y, w, h, fontFace: FONT, valign: 'top', lineSpacingMultiple: 1.12 },
    );
  }
  function card(slide, x, y, w, h, head, body, accent = PURPLE) {
    slide.addShape('roundRect', { x, y, w, h, fill: { color: INK2 }, line: { color: '24305A', width: 1 }, rectRadius: 0.06 });
    slide.addShape('rect', { x, y, w: 0.055, h, fill: { color: accent }, line: { type: 'none' } });
    slide.addText(head, { x: x + 0.26, y: y + 0.2, w: w - 0.45, h: 0.34, fontFace: FONT, fontSize: 13.5, bold: true, color: accent });
    slide.addText(body, { x: x + 0.26, y: y + 0.6, w: w - 0.45, h: h - 0.78, fontFace: FONT, fontSize: 11.5, color: DIM, valign: 'top', lineSpacingMultiple: 1.12 });
  }

  // ── 1 封面 ─────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    s.addImage({ path: iconPath, x: 0.72, y: 0.62, w: 1.5, h: 1.5 });
    s.addText('Rokid Spatial Joy 2026 · 全球开发大赛 · Rokid AI 赛道', { x: 0.72, y: 2.5, w: 11.9, h: 0.34, fontFace: FONT, fontSize: 12, color: GREEN, charSpacing: 2 });
    s.addText('紫微星盘', { x: 0.68, y: 2.9, w: 11.9, h: 1.15, fontFace: FONT, fontSize: 60, bold: true, color: WHITE });
    s.addText('Ziwei Star Chart', { x: 0.72, y: 4.0, w: 11.9, h: 0.4, fontFace: FONT, fontSize: 17, color: PURPLE, charSpacing: 3 });
    s.addText(
      '一句话包：眼镜端立即立现一张可复核的十二宫盘，抬头低头用准星选宫，听这一宫在讲什么。',
      { x: 0.72, y: 4.62, w: 10.6, h: 0.6, fontFace: FONT, fontSize: 15, color: 'C7CEE0' },
    );
    s.addShape('line', { x: 0.72, y: 5.5, w: 11.9, h: 0, line: { color: '2A3457', width: 1 } });
    s.addText(
      [
        { text: '形态　', options: { color: '5B6480', fontSize: 10.5 } },
        { text: 'AIUI 智能体（单 Page + 端侧引擎）　', options: { color: DIM, fontSize: 11.5 } },
        { text: '运行环境　', options: { color: '5B6480', fontSize: 10.5 } },
        { text: 'Rokid AI Glasses（480×352 单色绿 HUD）', options: { color: DIM, fontSize: 11.5 } },
      ],
      { x: 0.72, y: 5.72, w: 11.9, h: 0.34, fontFace: FONT },
    );
    s.addText('陈放 Frank / 紫微助手（ziwei-assistant）　·　2026-11-07', {
      x: 0.72, y: 6.12, w: 11.9, h: 0.34, fontFace: FONT, fontSize: 11.5, color: DIM,
    });
  }

  // ── 2 定位 ─────────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '01 · 作品定位', '把传统术数的盘面，做成一块能亲手操作的盘', '不是问答助手，不是结果服务 —— 是一件可以在眼镜上直接操作的工具');
    bullets(s, [
      { text: '说出生辰，眼镜端立刻立现一张十二宫盘面。', bold: true },
      { text: '宫位、主星、安星、五行局、大限全部由确定性规则算出，不是模型生成的结果。' },
      { text: '抬头低头转头用准星连续移动选宫，按确认键，听这一宫在讲什么。' },
      { text: '同一张本命盘可循环切到 大限 / 流年 / 流月 四层。', bold: true },
      { text: '解读正文来自公开数据集的原文检索，模型只负责把原文讲成一段话。' },
    ], { y: 2.35, fontSize: 15, gap: 16 });
    card(s, 0.72, 5.5, 3.75, 1.4, '算', '排盘由确定性规则引擎在端侧完成，同一生辰必得同一张盘，可复算复核。', GREEN);
    card(s, 4.78, 5.5, 3.75, 1.4, '查', '解读文本来自 674,976 盘 × 13 维的公开数据集原文检索，不是模型凭空生成。', PURPLE);
    card(s, 8.84, 5.5, 3.78, 1.4, '指向', '准星是连续二维光标，不是跳格；镜腿按键永远兜底，不依赖传感器。', '4FA8FF');
    foot(s, 2);
  }

  // ── 3 目标用户 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '02 · 目标用户', '想认真看懂一张盘的人', '低频但高意图 —— 不是日常陪伴型使用');
    card(s, 0.72, 2.35, 3.75, 2.1, '场景 A · 通勤路上', '对传统术数有兴趣但没人可问的人。手机排盘 App 要解锁、点选五项、等加载，30 秒里他已经把眼镜摘下来了。', GREEN);
    card(s, 4.78, 2.35, 3.75, 2.1, '场景 B · 书房里', '想核对一处断语出处的人。逐宫听解读原文，比在一篇长文里翻找快得多。', PURPLE);
    card(s, 8.84, 2.35, 3.78, 2.1, '场景 C · 新手', '刚入门、连十二宫都分不清的人。准星指向哪一格，眼镜就讲哪一格，不用学操作。', '4FA8FF');
    bullets(s, [
      '设计取舍：宁可用词朴素，也不给任何结果承诺 —— 只讲盘面上客观存在的结构性事实。',
      '传播钩子：四层运限给了「本月再看一次」的理由，是短视频最自然的素材结构。',
    ], { y: 4.75, fontSize: 13.5, gap: 10 });
    foot(s, 3);
  }

  // ── 4 核心流程 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '03 · 核心体验流程', '四步闭环，全程不白屏', '任何一步失败都有兜底：退成只显示盘面，而不是转圈或报错');
    const steps = [
      ['① 说出生辰', '语音输入「1990年1月1日 早上 男」→ 解析成 5 个参数 → 端侧引擎排盘；不知道时辰就说「不知道时辰」，按午时排并明示估算'],
      ['② 立现盘面', '引擎在端侧算出十二宫 → 480×352 单色绿 HUD 四四方阵 → 中宫显示命主身主'],
      ['③ 准星选宫', 'AbsoluteOrientationSensor 取四元数 → 欧拉角 → 网格 → 地支；准星连续二维移动'],
      ['④ 听解读 / 追问', '确认键取该宫 13 维解读原文并朗读；浮层里再按确认键进入追问，答案带宫位与时间层焦点'],
    ];
    steps.forEach(([h, b], i) => {
      const x = 0.72 + i * 3.02;
      card(s, x, 2.3, 2.84, 1.95, h, b, i % 2 === 0 ? GREEN : PURPLE);
      if (i < steps.length - 1) {
        s.addText('→', { x: x + 2.84, y: 3.05, w: 0.2, h: 0.4, fontFace: FONT, fontSize: 16, color: '5B6480', align: 'center' });
      }
    });
    s.addText('按键映射（全模式一致，镜腿按键，没有 tap / 双击）', { x: 0.72, y: 4.5, w: 11.9, h: 0.32, fontFace: FONT, fontSize: 12.5, color: WHITE, bold: true });
    const rows = [
      [{ text: '输入', options: { bold: true, color: 'C7CEE0' } }, { text: '做什么', options: { bold: true, color: 'C7CEE0' } }],
      ['准星 / 抬头低头', '选宫：连续二维光标；抬头低头切换相邻宫'],
      ['左右键', '沿盘面外圈巡宫，十二宫全覆盖'],
      ['上下键', '切换时间层：本命 → 大限 → 流年 → 流月'],
      ['确认键', '听该宫解读 / 进入追问'],
      ['返回键', '盘面态回生辰录入层（重新说生辰），再按一次退出'],
    ];
    s.addTable(rows, {
      x: 0.72, y: 4.88, w: 11.9, colW: [3.2, 8.7],
      fontFace: FONT, fontSize: 11.5, color: DIM,
      border: { type: 'solid', color: '24305A', pt: 1 },
      fill: { color: INK2 }, valign: 'middle', rowH: 0.3, margin: 0.06,
    });
    foot(s, 4);
  }

  // ── 5 产品形态 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '04 · 产品形态', '480 × 352 单色绿 HUD 上的十二宫盘面', '下方为模拟器渲染（真实引擎数据 + 真实布局 + 真实样式），非真机照片');
    s.addImage({ path: boardLiunian, x: 0.72, y: 2.2, w: 6.14, h: 4.5 });
    bullets(s, [
      { text: '四四方阵：中央 2×2 是中宫，十二宫环绕 —— 与 Web 端同一套布局函数。' },
      { text: '单色绿屏没有颜色可区分，所以运限四化带「限 / 流」前缀；本命四化在运限层整层隐藏。' },
      { text: '中宫随时间层切换层标题、本层命宫落位与本层四化摘要。' },
      { text: '端侧引擎加载失败时，运限层整体不可用，界面退成只有本命盘 —— 不给一层空白。' },
    ], { x: 7.15, y: 2.3, w: 5.47, fontSize: 12.5, gap: 12 });
    foot(s, 5);
  }

  // ── 6 四层运限 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '05 · 四层运限', '本命之上，大限 / 流年 / 流月', '运限层只给结构定位，不重写解读文本');
    s.addImage({ path: boardNatal, x: 1.18, y: 2.28, w: 5.5, h: 4.04 });
    s.addImage({ path: boardLiunian, x: 6.82, y: 2.28, w: 5.5, h: 4.04 });
    s.addText('本命盘（静态）', { x: 1.18, y: 6.42, w: 5.5, h: 0.28, fontFace: FONT, fontSize: 11.5, color: DIM, align: 'center' });
    s.addText('流年 丙午 2026（运限层）', { x: 6.82, y: 6.42, w: 5.5, h: 0.28, fontFace: FONT, fontSize: 11.5, color: GREEN, align: 'center' });
    foot(s, 6);
  }

  // ── 7 技术架构 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '06 · 技术架构', '端侧确定性排盘 + 服务端数据集检索', '两条路径同一引擎，9 份金标准盘逐字段钉死');
    card(s, 0.72, 2.3, 5.85, 2.2, '端侧（眼镜内）', '安星、五行局、十二宫、大限/流年/流月四层，全部由打包进 assets/engine.js 的开源排盘引擎算出（862.4 KB，MIT）。\n\n断网照样能出盘、能切层 —— 排盘这一层不依赖服务端。', GREEN);
    card(s, 6.82, 2.3, 5.85, 2.2, '服务端（自有域名）', '/api/agent/chart　兜底排盘\n/api/agent/reading　13 维解读原文检索\n/api/agent/ask　基于这张盘的追问\n\n眼镜端不直连境外大模型；受限引文在输入层 / 输出层 / 提示词三层一起降级。', PURPLE);
    bullets(s, [
      { text: '同一生辰必得同一张盘 —— 9 份金标准盘与源码引擎整对象 deepEqual，不是逐字段近似。' },
      { text: '端侧与服务端两条路径结果一致，切换不产生差异。' },
      { text: '回归网随每次改动跑：当前 13 个测试文件 / 163 个用例全绿。' },
    ], { y: 4.75, fontSize: 13, gap: 9 });
    foot(s, 7);
  }

  // ── 8 差异亮点 ─────────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '07 · 差异亮点', '算 + 查 + 指向 + 四层，四件事装进一副眼镜', '每一条都能对着规则表或数据集一条条核');
    const items = [
      ['① 准星是连续二维光标', '不是「看向哪选哪个」的跳格选择器 —— 绝对方向传感器出四元数，欧拉角连续映射到网格，准星在格内平滑移动，边缘有停顿保护带。', GREEN],
      ['② 排盘零模型，可复算', '同一生辰必得同一张盘。评委会问的「结果对不对」，这里给的是可复算的规则，而不是一个数字。', PURPLE],
      ['③ 解读有出处', '674,976 盘 × 13 维的公开数据集原文检索；受限引文按许可降级为占位符，并披露当前文本形态。', '4FA8FF'],
      ['④ 四层运限', '本命 / 大限 / 流年 / 流月端侧可切。运限层给的是「这一层引动哪几个宫」这类可复核的结构事实。', 'FFB86B'],
    ];
    items.forEach(([h, b, c], i) => {
      const x = 0.72 + (i % 2) * 6.1;
      const y = 2.3 + Math.floor(i / 2) * 2.35;
      card(s, x, y, 5.85, 2.1, h, b, c);
    });
    foot(s, 8);
  }

  // ── 9 数据与合规 ───────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '08 · 数据与合规', '正文有出处，边界写清楚', '这一块是我们准备最充分的 —— 评审关心合规时直接拿出来讲');
    card(s, 0.72, 2.3, 5.85, 2.15, '数据集', '「紫微斗数开源解读数据集 v4.0-13d」\n674,976 盘 × 13 维｜1950–2026｜CC BY 4.0\n\n索引完整性已核对：77 年、674,976 条记录，与 Web / CLI 口径一致。', PURPLE);
    card(s, 6.82, 2.3, 5.85, 2.15, '许可陷阱与处置', '数据集正文属 CC BY 4.0，但正文里引用的他人原话不在授权范围内，不能随商业分发。\n\n三层防线：拼提示词前脱敏、模型输出后再脱敏、提示词里加许可红线；响应带当前文本形态标识，眼镜端浮层显示。', GREEN);
    bullets(s, [
      '仅供传统文化学习与研究之用。盘面由确定性规则计算得出，可复算复核；解读文本来自公开数据集原文检索。不代表任何预测或建议，不构成医疗、法律、投资或人生决策建议。',
      '隐私：生辰、盘面、对话只存眼镜本机；不上传摄像头或麦克风数据；上传的只有检索所需的 5 个生辰参数。',
    ], { y: 4.7, fontSize: 12, gap: 10 });
    foot(s, 9);
  }

  // ── 10 完成度与提交 ────────────────────────────────────
  {
    const s = pptx.addSlide();
    bg(s);
    title(s, '09 · 完成度与提交', '已验证的 / 未验证的，如实分开写', '「作品完成度」在评委榜与用户榜各占一次 —— 真机验证是权重最高也最容易补齐的缺口');
    card(s, 0.72, 2.3, 5.85, 2.4, '已验证', '· 端侧引擎打包，产物指纹 sha256:c28b129d…aa67，862.4 KB\n· 9 份金标准盘与源码引擎整对象 deepEqual（67 例）\n· 引文检测与降级自测 25 例全过，含真实数据回归\n· 后端三接口已上线生产域名并实测 200\n· 回归网 13 文件 / 163 例全绿；类型检查 9 包全过', GREEN);
    card(s, 6.82, 2.3, 5.85, 2.4, '未验证（如实列出）', '· 全链路从未在 Rokid AI Glasses 真机上跑过\n· 绝对方向传感器在真机是否可用、加速度计轴向与方向\n· 镜腿手势 GlobalHook 在滑动时是否误上报\n· TTS 音质 / 语速 / 打断\n· 运限层在真机上的渲染与切换手感', 'FFB86B');
    s.addText('初赛提交材料清单', { x: 0.72, y: 4.86, w: 11.9, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: WHITE });
    const rows = [
      [{ text: '材料', options: { bold: true, color: 'C7CEE0' } }, { text: '状态', options: { bold: true, color: 'C7CEE0' } }, { text: '说明', options: { bold: true, color: 'C7CEE0' } }],
      ['作品策划案（PDF）', '✓ 已完成', '17 页，5.2 MB；红线词表已脱敏，不出现在提交给审核方的文件里'],
      ['作品信息介绍（PPT）', '✓ 本文件', '含模拟器渲染的产品画面'],
      ['智能体图标（1:1）', '✓ 已完成', '十二宫格 + 中宫准星 + 紫微星；默认图标会被打回，已替换'],
      ['AI 赛道配套 APK', '待上架后产出', '来自 AIUI Studio 提审上架'],
      ['实机录制视频', '待真机', '必须在真机上拍，不可用模拟器画面替代'],
    ];
    s.addTable(rows, {
      x: 0.72, y: 5.22, w: 11.9, colW: [3.0, 1.9, 7.0],
      fontFace: FONT, fontSize: 10.5, color: DIM,
      border: { type: 'solid', color: '24305A', pt: 1 },
      fill: { color: INK2 }, valign: 'middle', rowH: 0.25, margin: 0.05,
    });
    foot(s, 10);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  await pptx.writeFile({ fileName: outPath });
  const mb = (statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`✓ 作品信息介绍 PPT 已生成：${outPath}`);
  console.log(`  ${mb} MB（赛事上限 1 GB）｜10 页`);
}

main().catch((err) => {
  console.error('✗ 生成失败：', err.message);
  process.exit(1);
});
