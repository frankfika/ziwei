/**
 * 提审素材门禁 —— 挂进回归套件。
 *
 * 为什么要有这个文件：
 *   `submit-kit/preview/` 里的图是**提审要用的正式素材**（作品信息介绍 PPT 的配图、
 *   提审页的预览图）。它们是二进制文件，靠人眼很难发现「被误删」「被换成旧版」
 *   「尺寸不对导致上传被拒」这类问题。
 *
 *   2026-11-08 AIUI Studio 复验后新增了两张**来自 Rokid 运行时**的截图
 *   （`sim-reading.png` / `sim-ask.png`），它们是「Studio 侧真的跑通了」的唯一视觉凭证。
 *   这个文件把这些资产钉死：
 *     · 文件在不在
 *     · 是不是合法 PNG、尺寸是多少（提审页对预览图有规格要求）
 *     · 文档里记录的 AIX 包名 / 大小与实际复验记录一致（防文档漂移）
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeError, type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = path.join(REPO_ROOT, 'apps/rokid-agent');
const PREVIEW_DIR = path.join(AGENT_DIR, 'submit-kit/preview');

/** PNG 签名 + IHDR 头 → 读出宽高 */
function pngSize(file: string): { width: number; height: number } | null {
  const buf = readFileSync(file);
  // 8 字节签名 + 4 字节长度 + 4 字节 'IHDR' = 偏移 16 处是 width
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(signature)) return null;
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** 提审预览素材清单：文件 → 期望宽度（px） */
const PREVIEW_ASSETS: Array<{ file: string; minWidth: number; minHeight: number }> = [
  // 本地首启模拟器渲染的盘面（480×352 @3x）
  { file: 'board-first-launch.png', minWidth: 480, minHeight: 352 },
  // AIUI Studio 的 Rokid 运行时渲染（2026-11-08 复验）
  { file: 'sim-reading.png', minWidth: 480, minHeight: 600 },
  { file: 'sim-ask.png', minWidth: 480, minHeight: 600 },
];

/** 2026-11-08 10:33 重新打包后的 AIX 包（含追问超时修复）—— 10:56 首次提审提交的就是这一版 */
const SUBMITTED_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794105155119.aix';
/** 2026-11-08 18:52 提审重提时提交的那一版（Intl 兜底） */
const RESUBMITTED_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794133305274.aix';
/** 2026-11-08 19:19 重打（含追问超时修复 + Intl 兜底 + 时辰入口改造）—— 现行版 */
const CURRENT_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794136722831.aix';
/** 2026-11-08 16:57 重打（首帧修复版预览视频） */
const HEADFIX_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794128239691.aix';
/** 2026-11-08 18:12 那一版 —— 端侧引擎带了第一版坏补丁，眼镜上直接崩，已作废 */
const BROKEN_SHIM_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794132724122.aix';
/** 2026-11-08 10:08 那一版 —— 含「追问超时 40s」的老 bug，已作废 */
const OLD_TIMEOUT_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794100520699.aix';
/** 更早的那一版（修「模拟器出不了盘」之前的代码） */
const STALE_AIX = 'bcdceff1163f4e6e8dea474d03b5f0c9-1794011125685.aix';
/** 文档里允许出现的 AIX 包名白名单 —— 出了这个集合就是笔误 */
const KNOWN_AIX = new Set([
  CURRENT_AIX,
  RESUBMITTED_AIX,
  SUBMITTED_AIX,
  HEADFIX_AIX,
  BROKEN_SHIM_AIX,
  OLD_TIMEOUT_AIX,
  STALE_AIX,
]);
/** 取包脚本 */
const FETCH_SCRIPT = path.join(AGENT_DIR, 'scripts/fetch-aix.mjs');
/** 提审预览视频（提审页要求 3–5 个素材、至少 1 图 1 视频） */
const VIDEO_FILE = 'ziwei-preview.mp4';
const VIDEO_SCRIPT = path.join(AGENT_DIR, 'scripts/render-preview-video.mjs');
/** 视频尺寸 = 眼镜画布 480×352 的 2 倍 */
const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 704;
/** 要扫描包名的文档 */
const DOC_FILES = [
  'SUBMIT-RUNBOOK.md',
  'PROPOSAL.md',
  'DEVICE-CHECKLIST.md',
  'README.md',
  'HANDOVER.md',
];

export const suite: SuiteFn = async (t) => {
  // ── ① 提审预览素材必须齐 ──
  for (const asset of PREVIEW_ASSETS) {
    await t.test(`预览素材存在且是合法 PNG：${asset.file}`, () => {
      const p = path.join(PREVIEW_DIR, asset.file);
      if (!existsSync(p)) throw new Error(`缺少预览素材 ${asset.file}`);
      const size = statSync(p).size;
      if (size < 1000) throw new Error(`${asset.file} 只有 ${size} 字节，疑似空文件`);
      const dim = pngSize(p);
      if (!dim) throw new Error(`${asset.file} 不是合法 PNG（签名或 IHDR 头不对）`);
      if (dim.width < asset.minWidth || dim.height < asset.minHeight) {
        throw new Error(`${asset.file} 尺寸 ${dim.width}×${dim.height}，低于要求的 ${asset.minWidth}×${asset.minHeight}`);
      }
    });
  }

  // ── ② 中间产物不入库（只有 *.html 被 gitignore；png 必须入库）──
  await t.test('preview 目录下的 PNG 是入库资产（未被 gitignore）', () => {
    const gitignore = readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    for (const asset of PREVIEW_ASSETS) {
      const rule = `apps/rokid-agent/submit-kit/preview/${asset.file}`;
      if (gitignore.includes(rule)) throw new Error(`${rule} 被 .gitignore 排除了，入库资产不应被忽略`);
    }
    // 反向：html 中间产物必须被忽略
    if (!/submit-kit\/preview\/\*\.html/.test(gitignore)) {
      throw new Error('.gitignore 缺少 submit-kit/preview/*.html 规则（渲染中间产物会污染仓库）');
    }
  });

  // ── ③ 文档不能漂移：现行 AIX 包名与「旧包已作废」的标注 ──
  const runbook = readFileSync(path.join(AGENT_DIR, 'SUBMIT-RUNBOOK.md'), 'utf8');
  const proposal = readFileSync(path.join(AGENT_DIR, 'PROPOSAL.md'), 'utf8');
  const checklist = readFileSync(path.join(AGENT_DIR, 'DEVICE-CHECKLIST.md'), 'utf8');

  await t.test('SUBMIT-RUNBOOK 与 PROPOSAL 都记录了现行 AIX 包', () => {
    for (const [name, text] of [['SUBMIT-RUNBOOK.md', runbook], ['PROPOSAL.md', proposal]] as const) {
      if (!text.includes(CURRENT_AIX)) {
        throw new Error(`${name} 没记录现行 AIX 包名 ${CURRENT_AIX}（文档与实际打包结果漂移了）`);
      }
    }
  });

  await t.test('旧 AIX 包只以「已作废」的身份出现', () => {
    for (const [name, text] of [
      ['SUBMIT-RUNBOOK.md', runbook],
      ['PROPOSAL.md', proposal],
      ['DEVICE-CHECKLIST.md', checklist],
    ] as const) {
      if (!text.includes(STALE_AIX)) continue; // 没提就没事
      const idx = text.indexOf(STALE_AIX);
      const around = text.slice(Math.max(0, idx - 200), idx + 200);
      if (!around.includes('作废')) {
        throw new Error(`${name} 提到旧包 ${STALE_AIX} 但没标「已作废」，容易被误当成现行包`);
      }
    }
  });

  // ── ④ Studio 复验记录必须落在文档里（这是唯一凭证）──
  await t.test('Studio 复验记录已写回文档', () => {
    const markers = ['lib/birth-source.js', '使用端侧引擎排盘', '盘面来源=device'];
    for (const [name, text] of [['SUBMIT-RUNBOOK.md', runbook], ['PROPOSAL.md', proposal]] as const) {
      for (const m of markers) {
        if (!text.includes(m)) throw new Error(`${name} 缺 Studio 复验证据：${m}`);
      }
    }
  });

  // ── ⑤ 模拟器能力边界必须写明（方向键/返回键验不到，别误报已验证）──
  await t.test('文档写明模拟器无方向键与返回键', () => {
    if (!runbook.includes('方向键')) throw new Error('SUBMIT-RUNBOOK.md 没写明模拟器缺方向键/返回键');
    if (!runbook.includes('返回键')) throw new Error('SUBMIT-RUNBOOK.md 没写明模拟器缺方向键/返回键');
  });

  // ── ⑧ 预览素材的渲染脚本不得残留旧键位映射 ──
  // 那套「确认键听解读 / 上下切层 / 左右选宫」正是被商店驳回的映射。
  // 预览图与预览视频是**烘焙进 PNG/MP4 的像素**，改脚本不重渲染，素材里就还留着。
  await t.test('预览素材脚本里没有旧键位映射（那套已被商店驳回）', () => {
    const scripts = [
      path.join(AGENT_DIR, 'scripts/render-board-preview.mjs'),
      path.join(AGENT_DIR, 'scripts/render-preview-video.mjs'),
      path.join(AGENT_DIR, 'scripts/simulate-first-launch.mjs'),
    ];
    for (const p of scripts) {
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      for (const stale of ['确认键听解读', '上下切层', '左右选宫']) {
        if (text.includes(stale)) {
          throw new Error(
            `${path.basename(p)} 仍写着旧键位映射「${stale}」—— 这套映射已被商店驳回，` +
              `提审素材不能带；改完脚本要重新渲染 PNG/MP4`,
          );
        }
      }
    }
  });

  // ── ⑥ 文档里出现的每一个 AIX 包名都必须在白名单里 ──
  // 起因：2026-11-08 发现文档里把旧包名写成了 `...03b50c9-...`（少一个 f），
  // 那个地址在 CDN 上是 404 —— 照着文档去取包的人会拿到「文件不存在」。
  // 包名是平台生成的长串，人眼核不出来，只能机器核。
  await t.test('文档里出现的 AIX 包名都在白名单内（防笔误拼错）', () => {
    const pattern = /bcdceff[0-9a-z]*-[0-9]+\.aix/g;
    const bad: string[] = [];
    for (const name of DOC_FILES) {
      const p = path.join(AGENT_DIR, name);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, 'utf8');
      for (const m of text.match(pattern) ?? []) {
        if (!KNOWN_AIX.has(m)) bad.push(`${name}: ${m}`);
      }
    }
    if (bad.length) {
      throw new Error(
        `以下 AIX 包名不在白名单里（多半是手抄错字）：\n    ${bad.join('\n    ')}\n` +
          `  白名单只有：${[...KNOWN_AIX].join(' / ')}`,
      );
    }
  });

  // ── ⑦ 取包路径必须留在文档里：没有浏览器也能把包拿到手 ──
  await t.test('文档写明 AIX 的 CDN 取包地址与取包脚本', () => {
    if (!runbook.includes('basecloud.rokidcdn.com')) {
      throw new Error('SUBMIT-RUNBOOK.md 没写 AIX 的 CDN 地址（下次就不知道去哪儿取包）');
    }
    if (!runbook.includes('aix:fetch')) {
      throw new Error('SUBMIT-RUNBOOK.md 没写 npm run aix:fetch');
    }
  });

  // ── ⑧ 取包脚本本身要在（且语法能过）──
  await t.test('fetch-aix.mjs 存在且语法正确', () => {
    if (!existsSync(FETCH_SCRIPT)) throw new Error('缺少 apps/rokid-agent/scripts/fetch-aix.mjs');
    try {
      execFileSync('node', ['--check', FETCH_SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error(`fetch-aix.mjs 语法错误：${describeError(e)}`);
    }
  });

  // ── ⑨ 提审预览视频：提审页要求「共 3–5 个素材，至少 1 图 1 视频」──
  // 视频由 render-preview-video.mjs 用真实页面逻辑 + 真实端侧引擎 + 真实后端解读渲染出来。
  await t.test('提审预览视频存在且是合法 MP4', () => {
    const p = path.join(PREVIEW_DIR, VIDEO_FILE);
    if (!existsSync(p)) throw new Error(`缺少提审预览视频 ${VIDEO_FILE}（提审页要求至少 1 个视频）`);
    const size = statSync(p).size;
    // 提审页实测规格（2026-11-08 从 Studio bundle 抄出）：单个视频 ≥ 1 KB 且 ≤ 50 MB
    if (size < 1024) throw new Error(`${VIDEO_FILE} 只有 ${size} 字节`);
    if (size > 50 * 1024 * 1024) {
      throw new Error(`${VIDEO_FILE} 有 ${(size / 1024 / 1024).toFixed(1)} MB，超过提审页 50 MB 上限`);
    }
    const buf = readFileSync(p);
    if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') {
      throw new Error(`${VIDEO_FILE} 不是合法 MP4（第 5–8 字节应为 ftyp）`);
    }
    if (!buf.includes(Buffer.from('avc1', 'ascii'))) {
      throw new Error(`${VIDEO_FILE} 里找不到 h264 编码标记 avc1，提审页只吃 MP4`);
    }
    if (!buf.includes(Buffer.from('moov', 'ascii'))) {
      throw new Error(`${VIDEO_FILE} 缺少 moov atom，文件不完整`);
    }
  });

  await t.test('预览视频的编码/尺寸/时长符合提审要求', () => {
    const p = path.join(PREVIEW_DIR, VIDEO_FILE);
    if (!existsSync(p)) throw new Error(`缺少 ${VIDEO_FILE}`);
    let out: string;
    try {
      out = execFileSync(
        'ffprobe',
        ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', p],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (e) {
      // 没装 ffprobe 就跳过这一条，不让整个套件挂在环境上
      console.warn(`    （跳过：ffprobe 不可用 —— ${describeError(e)}）`);
      return;
    }
    const probe = JSON.parse(out) as {
      streams: Array<{ codec_type: string; codec_name?: string; width?: number; height?: number }>;
      format: { duration?: string };
    };
    const v = probe.streams.find((s) => s.codec_type === 'video');
    if (!v) throw new Error('预览视频里没有视频流');
    if (v.codec_name !== 'h264') throw new Error(`视频编码是 ${v.codec_name}，提审页要 MP4/H.264`);
    if (v.width !== VIDEO_WIDTH || v.height !== VIDEO_HEIGHT) {
      throw new Error(`视频尺寸是 ${v.width}×${v.height}，应为 ${VIDEO_WIDTH}×${VIDEO_HEIGHT}`);
    }
    const dur = Number(probe.format.duration ?? 0);
    if (!(dur > 3 && dur < 120)) throw new Error(`视频时长 ${dur}s，不在合理区间（3–120s）`);
  });

  // ── ⑩ 生成脚本要在、语法要过、npm script 要挂上 ──
  await t.test('render-preview-video.mjs 存在且语法正确', () => {
    if (!existsSync(VIDEO_SCRIPT)) throw new Error('缺少 apps/rokid-agent/scripts/render-preview-video.mjs');
    try {
      execFileSync('node', ['--check', VIDEO_SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error(`render-preview-video.mjs 语法错误：${describeError(e)}`);
    }
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    if (!pkg.scripts || !pkg.scripts['video:preview']) {
      throw new Error('package.json 缺 video:preview 脚本（下次没人知道怎么重生成视频）');
    }
  });

  // ── ⑪ 视频必须带「模拟器渲染」标注：不能冒充真机 ──
  // 仓库规矩（render-board-preview.mjs 抬头）：模拟器渲染的产物对外必须标注。
  // 提审预览素材是要给审核方看的东西，冒充真机 = 失实。
  await t.test('预览视频带「模拟器渲染」标注，且文档写明它替代不了真机视频', () => {
    const script = readFileSync(VIDEO_SCRIPT, 'utf8');
    if (!script.includes('AIUI Studio 模拟器渲染')) {
      throw new Error('render-preview-video.mjs 里没有「AIUI Studio 模拟器渲染」角标 —— 模拟器产物对外必须标注');
    }
    if (!runbook.includes('模拟器渲染')) {
      throw new Error('SUBMIT-RUNBOOK.md 没写明预览视频是模拟器渲染');
    }
    if (!runbook.includes('真机视频')) {
      throw new Error('SUBMIT-RUNBOOK.md 没写明初赛仍需真机视频（别让人以为这份就够了）');
    }
  });
};
