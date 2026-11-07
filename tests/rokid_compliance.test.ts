/**
 * 合规禁用词门禁 —— 挂进回归套件。
 *
 * 为什么必须挂进 `npm test`：
 *   `PROPOSAL.md` §9.3 的禁用词表写了很久，但**从来没有任何命令会因违反它而失败** ——
 *   规则只要没有守门人，就只是装饰。这个文件把门禁接进 CI：
 *   对外材料（商店描述 / 社区帖 / FAQ / 视频脚本 / 策划案）与眼镜端可见文案里
 *   出现 TIER1 硬禁用词 → 用例失败。
 *
 * 判定逻辑在 `apps/rokid-agent/scripts/forbidden-terms.mjs`，
 * 这里不重复实现，只把它当黑盒跑一遍（跟 CI 里实际执行的是同一条命令）。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeError, type SuiteFn } from './harness';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'apps/rokid-agent/scripts/check-compliance.mjs');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'apps/rokid-agent/scripts/build-proposal-pdf.mjs');

/** TIER1 硬禁用词 —— 与 `apps/rokid-agent/scripts/forbidden-terms.mjs` 从 PROPOSAL.md §9.3 解析出的主表一致。 */
const HARD_TERMS = [
  '预测吉凶', '转运', '开运', '改命', '化解厄运', '消灾避祸', '趋吉避凶', '算命', '占卜', '卜卦',
  '看运势', '灵验', '准不准', '准确率', '命中率', '风水调理', '调理风水', '能量', '磁场', '灵力',
  '注定', '一生命运', '开光', '法事', '灵摆',
];

interface GateResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGate(): GateResult {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export const suite: SuiteFn = async (t) => {
  await t.test('禁用词门禁脚本退出码为 0（TIER1 硬禁用零命中）', () => {
    const r = runGate();
    if (r.code !== 0) {
      throw new Error(
        `check-compliance.mjs 退出码 ${r.code}。\n--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
      );
    }
    if (!r.stdout.includes('0 处 TIER1 违规')) {
      throw new Error(`门禁输出里没找到「0 处 TIER1 违规」，说明脚本行为变了：\n${r.stdout}`);
    }
  });

  await t.test('禁用词门禁覆盖到全部对外提交材料与眼镜端可见文案', () => {
    const r = runGate();
    const m = r.stdout.match(/合规门禁通过：(\d+) 个文件/);
    if (!m) throw new Error(`门禁输出里没解析出扫描文件数：\n${r.stdout}`);
    const count = Number(m[1]);
    // submit-kit 5 份 + lib/*.js + pages/*.ink + PROPOSAL/README/HANDOVER/MAIL/app.json
    // 当前实际 21 个；低于 15 说明扫描范围被改小了。
    if (count < 15) {
      throw new Error(`只扫到 ${count} 个文件，扫描范围可能被意外改小（期望 ≥15）`);
    }
  });

  await t.test('禁用词词表确实解析自 PROPOSAL.md §9.3（不是硬编码副本）', () => {
    const r = runGate();
    const m = r.stdout.match(/TIER1\s*(\d+)\s*词/);
    if (!m) throw new Error(`没解析出词表规模：\n${r.stdout}`);
    const size = Number(m[1]);
    if (size < 25) {
      throw new Error(`词表只解析出 ${size} 个词，§9.3 的锚点或解析逻辑坏了`);
    }
  });

  await t.test('报名用策划案 PDF：生成成功、体积达标、且不含 TIER1 红线词', async () => {
    // PDF 是生成物（不入 git，见 .gitignore），所以这里**现生成现校验**，
    // 而不是检查磁盘上有没有 —— 否则 fresh clone 的 `npm test` 会假失败。
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'ziwei-proposal-test-'));
    const out = path.join(tmpDir, 'proposal.pdf');
    try {
      try {
        execFileSync('node', [BUILD_SCRIPT, '--out', out], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        const e = error as { stdout?: string; stderr?: string };
        // 构建脚本依赖 pandoc + playwright chromium；环境缺件 → 跳过而不是失败。
        const msg = `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
        if (/生成失败|ENOENT|spawn/i.test(msg)) {
          t.skip('报名用策划案 PDF 的生成校验', '原因：环境缺 pandoc 或 playwright chromium');
          return;
        }
        throw new Error(`策划案 PDF 生成失败：\n${msg}`);
      }

      if (!existsSync(out)) throw new Error('构建脚本退出码为 0，但产物不存在');
      const size = statSync(out).size;
      if (size > 30 * 1024 * 1024) {
        throw new Error(`PDF ${(size / 1024 / 1024).toFixed(2)}MB，超过报名 30MB 上限`);
      }

      let text: string;
      try {
        text = execFileSync('pdftotext', ['-layout', out, '-'], { encoding: 'utf8' });
      } catch {
        t.skip('报名用策划案 PDF 的生成校验', '原因：环境缺 pdftotext（poppler 未装）');
        return;
      }
      const hits = HARD_TERMS.filter((w) => text.includes(w));
      if (hits.length > 0) {
        throw new Error(`对外 PDF 里出现红线词：${hits.join('、')}`);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
};

if (process.argv[1] && process.argv[1].endsWith('rokid_compliance.test.ts')) {
  const { runStandalone } = await import('./harness');
  await runStandalone(suite, '合规禁用词门禁');
}
