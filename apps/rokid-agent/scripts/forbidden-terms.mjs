/**
 * 合规禁用词门禁 —— 分两层。
 *
 * 为什么分层：§9.3 把词分成两种性质完全不同的东西，混在一起检查会导致门禁失效：
 *   - TIER1「硬禁用」：§9.3 主表那 25 个词（预测吉凶 / 转运 / 算命 / 占卜 / 能量 …）。
 *     它们是迷信与预测承诺话术，命中即违规 → **退出码 1**。
 *   - TIER2「软口径」：§9.3 替换口径表里「不要写」那一列隐含的词（命盘 / 运势 / 运程 / 吉凶 / 凶吉）。
 *     它们本身不宣称吉凶，只是行文用词；但全仓现有大量使用（含眼镜端层名「本命盘」），
 *     一次性替换会牵动交互文案与专业性 → 命中只**告警并出清单**，由人拍板。
 *
 * 词表单一真相源 = `PROPOSAL.md` §9.3（脚本直接解析，不另抄一份），本文件只放补充词。
 *
 * 内部区块：文档里「不要用 X」「X 的完整词表在……」这类元说明句本身含禁用词，
 * 属于预期例外。用 `<!-- compliance:internal -->` … `<!-- /compliance:internal -->` 包起来即可豁免。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

export const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** TIER2：§9.3 替换口径表隐含要求、但没进主表的词。 */
export const EXTRA_SOFT_TERMS = ['运势', '运程', '命盘', '吉凶', '凶吉'];

/** 元说明句标记：命中这些词说明「这句话本身在讲禁用规则」，不是违规用法。 */
const META_MARKERS = [
  '不要',
  '不把',
  '禁',
  '不得',
  '不能',
  '别把',
  '不可',
  '预期例外',
  '零命中',
  '替换口径',
  '改写成',
  '口径',
  '红线',
];

/** 内部区块标记。`proposal-pdf:redact` 块同时算内部块 —— 那里就是禁用词表本身。 */
const INTERNAL_OPEN = ['<!-- compliance:internal -->', '<!-- proposal-pdf:redact -->'];
const INTERNAL_CLOSE = '<!-- /compliance:internal -->';

export function parseForbiddenFromProposal(proposalText) {
  const anchor = proposalText.indexOf('**绝对不能出现的词**');
  if (anchor < 0) throw new Error('PROPOSAL.md 里找不到「**绝对不能出现的词**」，禁用词表解析失败');
  const m = proposalText.slice(anchor).match(/^> (.+)$/m);
  if (!m) throw new Error('PROPOSAL.md 里「**绝对不能出现的词**」之后没有 blockquote 词表行');
  const raw = m[1].replace(/（[^）]*）/g, '');
  const terms = raw
    .split(/[、,，;；]/)
    .flatMap((part) => part.split(/[／/]/))
    .map((s) => s.trim())
    .filter(Boolean);
  const unique = [...new Set(terms)];
  if (unique.length < 10) throw new Error(`禁用词表只解析出 ${unique.length} 个词，明显解析错了`);
  return unique;
}

export function loadTerms(proposalPath = join(AGENT_ROOT, 'PROPOSAL.md')) {
  const hard = parseForbiddenFromProposal(readFileSync(proposalPath, 'utf8'));
  return { hard, soft: [...new Set(EXTRA_SOFT_TERMS)] };
}

export function isMetaSentence(line) {
  return META_MARKERS.some((m) => line.includes(m));
}

/** 标注每一行是否落在 `compliance:internal` 区块内。 */
function markInternalBlocks(lines) {
  const flags = new Array(lines.length).fill(false);
  let inside = false;
  lines.forEach((line, i) => {
    if (INTERNAL_OPEN.some((m) => line.includes(m))) inside = true;
    flags[i] = inside;
    if (line.includes(INTERNAL_CLOSE)) inside = false;
  });
  return flags;
}

/**
 * @param {string[]} files
 * @param {{hard: string[], soft: string[]}} terms
 */
export function scanFiles(files, terms) {
  const violations = [];
  const softHits = [];
  const exempt = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const internal = markInternalBlocks(lines);
    lines.forEach((line, i) => {
      const hit = (term, tier) => ({
        file,
        line: i + 1,
        term,
        tier,
        text: line.trim().slice(0, 150),
      });
      for (const term of terms.hard) {
        if (!line.includes(term)) continue;
        if (internal[i] || isMetaSentence(line)) exempt.push(hit(term, 'hard'));
        else violations.push(hit(term, 'hard'));
      }
      for (const term of terms.soft) {
        if (!line.includes(term)) continue;
        softHits.push(hit(term, 'soft'));
      }
    });
  }
  return { violations, softHits, exempt, scanned: files.length };
}

export function formatReport({ violations, softHits, exempt }, root = AGENT_ROOT) {
  const out = [];
  if (violations.length) {
    out.push(`\n✗ TIER1 硬禁用命中 ${violations.length} 处（必须改）：`);
    for (const v of violations) {
      out.push(`  ${relative(root, v.file)}:${v.line}  [${v.term}]  ${v.text}`);
    }
  }
  const byFile = new Map();
  for (const s of softHits) {
    const k = relative(root, s.file);
    byFile.set(k, (byFile.get(k) || 0) + 1);
  }
  if (byFile.size) {
    out.push(`\n⚠ TIER2 软口径命中 ${softHits.length} 处（只告警，需人工拍板）：`);
    for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
      out.push(`  ${f}  ${n} 处`);
    }
  }
  if (exempt.length) {
    out.push(`\n· 元说明句 / 内部区块豁免 ${exempt.length} 处（预期例外）。`);
  }
  return out.join('\n');
}
