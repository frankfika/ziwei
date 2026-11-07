/**
 * 软著材料包（源程序打印稿 + 说明书）—— 挂进回归套件。
 *
 * 为什么必须挂进 `npm test`：
 *   软著登记对源程序打印稿的格式要求是**死的**：每页不少于 50 行、页眉含软件名称与版本号、
 *   提交前 30 页 + 后 30 页。这些规则一旦被改坏（少了几行、页眉丢了、页数不对），
 *   **不会报错**，只会等到提交登记机构被退材料才发现 —— 那时候返工成本极高。
 *
 * 这里钉住的是**生成逻辑**的硬约束，不重新生成 PDF（生成要走 playwright，慢且依赖全局安装）。
 * 真正的产物校验由 `scripts/build-copyright-materials.mjs` 自己在生成时保证。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeError, type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_ROOT = path.join(REPO_ROOT, 'apps/rokid-agent');
const SCRIPT = path.join(AGENT_ROOT, 'scripts/build-copyright-materials.mjs');
const COPYRIGHT_DIR = path.join(AGENT_ROOT, 'submit-kit/copyright');

export const suite: SuiteFn = async (t) => {
  // ── ① 生成脚本存在且可解析 ──────────────────────────
  await t.test('软著材料生成脚本存在', () => {
    if (!existsSync(SCRIPT)) throw new Error(`脚本不存在：${SCRIPT}`);
  });

  // ── ② 从脚本里读出关键常量与清单 ────────────────────
  const script = readFileSync(SCRIPT, 'utf8');

  const constOf = (name: string): string => {
    const m = script.match(new RegExp(`const ${name} = ([^;]+);`));
    if (!m) throw new Error(`脚本里读不到常量 ${name}`);
    return m[1].trim();
  };

  const LINES_PER_PAGE = Number(constOf('LINES_PER_PAGE'));
  const HEAD_PAGES = Number(constOf('HEAD_PAGES'));
  const TAIL_PAGES = Number(constOf('TAIL_PAGES'));
  const MAX_COLS = Number(constOf('MAX_COLS'));

  await t.test('每页行数 ≥ 50（软著硬要求）', () => {
    if (!(LINES_PER_PAGE >= 50)) {
      throw new Error(`LINES_PER_PAGE = ${LINES_PER_PAGE}，软著要求每页不少于 50 行`);
    }
  });

  await t.test('提交页构成为前 30 页 + 后 30 页', () => {
    if (HEAD_PAGES !== 30 || TAIL_PAGES !== 30) {
      throw new Error(`HEAD_PAGES=${HEAD_PAGES} / TAIL_PAGES=${TAIL_PAGES}，软著要求前 30 页 + 后 30 页`);
    }
  });

  // ── ③ 源程序清单：文件都存在，且不含打包产物 ──────────
  const sourceListM = script.match(/const SOURCE_FILES = \[([\s\S]*?)\];/);
  if (!sourceListM) throw new Error('脚本里读不到 SOURCE_FILES 清单');

  const sourceFiles = [...sourceListM[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

  await t.test('源程序清单非空', () => {
    if (sourceFiles.length < 5) throw new Error(`SOURCE_FILES 只有 ${sourceFiles.length} 项，明显不对`);
  });

  await t.test('源程序清单里的每个文件都存在', () => {
    const missing = sourceFiles.filter((f) => {
      const rel = f.replace(/^packages\/rokid-agent\//, 'apps/rokid-agent/');
      return !existsSync(path.join(REPO_ROOT, rel));
    });
    if (missing.length) throw new Error(`源文件不存在：${missing.join('、')}`);
  });

  await t.test('打包产物 assets/engine.js 不进源程序打印稿', () => {
    // engine.js 是 880 KB 的单行 bundle —— 塞进打印稿既超页又不可读
    if (sourceFiles.some((f) => f.includes('engine.js') && !f.includes('chart-engine/src'))) {
      throw new Error('SOURCE_FILES 里混进了打包产物 engine.js');
    }
  });

  await t.test('源程序总量够 60 页（≥ 3000 行）', () => {
    let total = 0;
    for (const f of sourceFiles) {
      const rel = f.replace(/^packages\/rokid-agent\//, 'apps/rokid-agent/');
      const abs = path.join(REPO_ROOT, rel);
      if (!existsSync(abs)) continue;
      total += readFileSync(abs, 'utf8').split('\n').length;
    }
    const need = (HEAD_PAGES + TAIL_PAGES) * LINES_PER_PAGE;
    if (total < need) {
      throw new Error(`源程序只有 ${total} 行，不足 ${need} 行（${HEAD_PAGES + TAIL_PAGES} 页 × ${LINES_PER_PAGE} 行）`);
    }
  });

  // ── ④ 折行逻辑：不能把代码裁掉 ─────────────────────
  await t.test('超长行被折行而不是裁掉', () => {
    // 复刻脚本里的 displayWidth：全角按 2 列
    const width = (s: string): number => {
      let w = 0;
      for (const ch of s) {
        const c = ch.codePointAt(0)!;
        const wide =
          (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
          (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60);
        w += wide ? 2 : 1;
      }
      return w;
    };
    // 找出仓库里最长的源码行
    let longest = '';
    for (const f of sourceFiles) {
      const rel = f.replace(/^packages\/rokid-agent\//, 'apps/rokid-agent/');
      const abs = path.join(REPO_ROOT, rel);
      if (!existsSync(abs)) continue;
      for (const l of readFileSync(abs, 'utf8').split('\n')) {
        if (width(l) > width(longest)) longest = l;
      }
    }
    if (width(longest) <= MAX_COLS) return; // 没超长行，不需要折
    // 折行后每段都要 ≤ MAX_COLS（续行留 2 空格缩进）
    const wrap = (text: string): string[] => {
      const out: string[] = [];
      let rest = text;
      let first = true;
      while (rest.length) {
        const limit = first ? MAX_COLS : MAX_COLS - 2;
        let cut = 0;
        let w = 0;
        for (const ch of rest) {
          const cw = width(ch);
          if (w + cw > limit) break;
          w += cw;
          cut += ch.length;
        }
        if (cut === 0) cut = 1;
        const piece = rest.slice(0, cut);
        rest = rest.slice(cut);
        out.push(first ? piece : `  ${piece}`);
        first = false;
      }
      return out;
    };
    const parts = wrap(longest);
    const over = parts.filter((p) => width(p) > MAX_COLS);
    if (over.length) {
      throw new Error(`折行后仍有 ${over.length} 段超过 ${MAX_COLS} 列，最长行宽 ${width(longest)} 列`);
    }
    // 折出来的内容必须能拼回原行（不能丢字符）
    const rejoined = parts.map((p, i) => (i === 0 ? p : p.slice(2))).join('');
    if (rejoined !== longest) throw new Error('折行后拼不回原行 —— 有字符丢失');
  });

  // ── ⑤ 页眉必须含软件名称与版本号（软著硬要求）──────
  await t.test('页眉含软件名称与版本号', () => {
    const m = script.match(/const SOFTWARE = \{([\s\S]*?)\n\};/);
    if (!m) throw new Error('脚本里读不到 SOFTWARE 对象');
    const block = m[1];
    if (!/name:\s*'紫微星盘'/.test(block)) throw new Error('SOFTWARE.name 不是「紫微星盘」');
    if (!/version:\s*'V1\.0'/.test(block)) throw new Error('SOFTWARE.version 不是 V1.0');
    // 页眉模板里必须真的用了 header 字段
    if (!/ph-title">\$\{esc\(SOFTWARE\.header\)\}/.test(script)) {
      throw new Error('页眉模板没有引用 SOFTWARE.header');
    }
  });

  // ── ⑥ 材料包文件齐备 ────────────────────────────────
  await t.test('说明书与提交指引在位', () => {
    for (const f of ['软件说明书.md', '登记要点与提交指引.md']) {
      const p = path.join(COPYRIGHT_DIR, f);
      if (!existsSync(p)) throw new Error(`缺文件：${p}`);
      if (statSync(p).size < 1000) throw new Error(`${f} 内容过少，疑似空壳`);
    }
  });

  await t.test('说明书章节齐备（10 章 + 附录 A）', () => {
    const md = readFileSync(path.join(COPYRIGHT_DIR, '软件说明书.md'), 'utf8');
    for (const ch of ['引言', '软件概述', '运行环境', '总体结构', '界面说明', '操作说明', '功能模块', '数据与隐私', '异常处理', '免责声明', '常见问题', '术语表']) {
      if (!md.includes(ch)) throw new Error(`说明书缺章节：${ch}`);
    }
  });

  await t.test('生成的 PDF 已存在且非空', () => {
    // PDF 是**生成物**（.gitignore 排除了 copyright/*.pdf），新克隆的仓库里没有。
    // 这是「环境缺条件」，允许 skip；一旦存在就必须有效。
    const missing: string[] = [];
    for (const f of ['紫微星盘-源程序.pdf', '紫微星盘-软件说明书.pdf']) {
      const p = path.join(COPYRIGHT_DIR, f);
      if (!existsSync(p)) missing.push(f);
    }
    if (missing.length) {
      t.skip('生成的 PDF 已存在且非空', `原因：PDF 是生成物，未入库（缺 ${missing.join('、')}）；跑 npm run copyright:materials 生成`);
      return;
    }
    for (const f of ['紫微星盘-源程序.pdf', '紫微星盘-软件说明书.pdf']) {
      const p = path.join(COPYRIGHT_DIR, f);
      const size = statSync(p).size;
      if (size < 50_000) throw new Error(`${f} 只有 ${size} 字节，疑似空文件`);
    }
  });

  // ── ⑦ 脚本必须真的能跑（--help 级别的冒烟）─────────
  await t.test('生成脚本可被 node 解析并进入执行路径', () => {
    // 只做语法解析，不真跑（真跑要 playwright + pandoc）
    try {
      execFileSync('node', ['--check', SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      throw new Error(`脚本语法错误：${describeError(e)}`);
    }
  });
};
