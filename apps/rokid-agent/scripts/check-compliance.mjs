#!/usr/bin/env node
/**
 * 合规禁用词门禁 —— 对外提交材料 + 眼镜端用户可见文案。
 *
 * 用法：
 *   node apps/rokid-agent/scripts/check-compliance.mjs          # 全量输出
 *   node apps/rokid-agent/scripts/check-compliance.mjs --quiet  # 只在有违规时输出
 *
 * 退出码：0 = 通过；1 = 有 TIER1 硬禁用命中。
 *
 * TIER1（§9.3 主表那 25 个词）命中即失败。
 * TIER2（命盘 / 运势 / 运程 / 吉凶 / 凶吉）只出清单告警，由人拍板是否替换。
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_ROOT, loadTerms, scanFiles, formatReport } from './forbidden-terms.mjs';

function collect(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (['node_modules', '.git', 'assets'].includes(name)) continue;
      collect(p, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

const quiet = process.argv.includes('--quiet');
const terms = loadTerms();

const files = [
  ...collect(join(AGENT_ROOT, 'submit-kit'), ['.md']),
  ...collect(join(AGENT_ROOT, 'lib'), ['.js']),
  ...collect(join(AGENT_ROOT, 'pages'), ['.ink']),
  ...['PROPOSAL.md', 'README.md', 'HANDOVER.md', 'MAIL-TO-ROKID.md', 'app.json']
    .map((f) => join(AGENT_ROOT, f))
    .filter((f) => existsSync(f)),
];

const result = scanFiles(files, terms);

if (!quiet || result.violations.length) {
  console.log(`禁用词门禁：TIER1 ${terms.hard.length} 词 + TIER2 ${terms.soft.length} 词，来源 PROPOSAL.md §9.3`);
  console.log(formatReport(result, AGENT_ROOT));
}

if (result.violations.length) {
  console.error(`\n✗ 合规门禁未通过：${result.violations.length} 处 TIER1 硬禁用命中。`);
  process.exit(1);
}
console.log(`\n✓ 合规门禁通过：${files.length} 个文件，0 处 TIER1 违规。`);
