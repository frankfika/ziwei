/**
 * 眼镜端（Rokid AIUI 智能体）引文降级 —— **许可红线的回归网**。
 *
 * 为什么这条线要单独钉死：
 *  · 解读数据集是 CC BY 4.0，但正文里引用的倪师《天纪》原话属
 *    CC BY-NC-SA 4.0（**不可商用**）；
 *  · 眼镜端是上架 Rokid 商店的**公开作品** = 商业分发场景，
 *    docs/LEGAL_NOTES.md 第 5 节要求商用前切到 `inline`；
 *  · 眼镜端**不直连境外 LLM**，解读与追问都走自己的后端 ——
 *    所以后端就是最后一道闸，前端降级漏了就等于把受限原文发到了用户眼前。
 *
 * 覆盖三件事：
 *  1. 模式默认值必须是 `inline`（Web 端的 `full` 是给本地自用/研究留的，
 *     眼镜端**不能**继承它 —— 这是曾经的真实缺口）；
 *  2. 输入层降级：拼给模型的提示词里，受限引文命中数必须为 0；
 *  3. 输出层兜底：模型自己吐出来的引文片段也必须被降级掉。
 *
 * 只测纯逻辑层（apps/web/src/lib/{citations,agentCitation}.ts + @ziwei/ask 的提示词组装），
 * 不碰网络与 next/headers。
 */

import assert from 'node:assert/strict';

import { AskService } from '@ziwei/ask';
import { countCitations, findCitations, redactCitations } from '@ziwei/citation-guard';

import { AGENT_SYSTEM_EXTRA, redactingService } from '../apps/web/src/lib/agentCitation';
import { resolveAgentCitationMode, resolveCitationMode } from '../apps/web/src/lib/citations';
import { getService } from '../apps/web/src/lib/service';

import { isMainModule, runStandalone, type Tester } from './harness';

/** 一个有数据集覆盖、且确定含《天纪》引文的生辰 */
const BIRTH = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const };

export const suite = async (t: Tester): Promise<void> => {
  /* ── ① 模式解析：眼镜端默认必须是 inline ─────────────────── */
  await t.test('眼镜端模式默认值是 inline（不是 full）', () => {
    assert.equal(resolveAgentCitationMode(undefined), 'inline', '没设环境变量时应为 inline');
    assert.equal(resolveAgentCitationMode(''), 'inline', '空串应回落到 inline');
    assert.equal(resolveAgentCitationMode('   '), 'inline', '空白应回落到 inline');
    assert.equal(resolveAgentCitationMode('garbage'), 'inline', '非法值应回落到 inline');
    assert.equal(resolveAgentCitationMode('full'), 'full', '只有显式 full 才放宽');
  });

  await t.test('Web 端与眼镜端的口径刻意不同（防串改）', () => {
    // Web 端默认 full（本地自用/演示/研究，引文是数据集价值的一部分）；
    // 眼镜端默认 inline（商业分发）。这两个默认值**必须**不一样 ——
    // 哪天有人把眼镜端改成复用 resolveCitationMode，这里立刻红。
    assert.equal(resolveCitationMode(undefined), 'full', 'Web 端默认仍应是 full');
    assert.notEqual(
      resolveAgentCitationMode(undefined),
      resolveCitationMode(undefined),
      '眼镜端与 Web 端的默认模式不应相同',
    );
  });

  /* ── ② 数据集与降级服务 ─────────────────────────────────── */
  const raw = getService().reading(BIRTH);
  if (raw.status !== 'ok') {
    t.skip('眼镜端引文降级（②③ 组）', `样本库未覆盖 ${BIRTH.year} 年该生辰`);
    return;
  }

  const rawCitations = raw.dimensions.reduce((s, d) => s + countCitations(d.text), 0);

  await t.test('样本确实含受限引文（否则后面的断言没有意义）', () => {
    assert.ok(
      rawCitations > 0,
      `原始维度文本应有《天纪》引文，实际命中 ${rawCitations} 处`,
    );
  });

  await t.test('降级后的维度文本里，受限引文命中数为 0', () => {
    const redacted = redactingService(getService(), 'inline').reading(BIRTH);
    assert.equal(redacted.status, 'ok', '降级服务应正常返回');
    if (redacted.status !== 'ok') return;
    const left = redacted.dimensions.reduce((s, d) => s + countCitations(d.text), 0);
    assert.equal(left, 0, `降级后仍有 ${left} 处受限引文`);
  });

  await t.test('降级只动正文，key/label/chars 一律不动', () => {
    const redacted = redactingService(getService(), 'inline').reading(BIRTH);
    assert.equal(redacted.status, 'ok');
    if (redacted.status !== 'ok') return;
    redacted.dimensions.forEach((d, i) => {
      const src = raw.dimensions[i];
      assert.equal(d.key, src.key, `第 ${i} 维 key 被改了`);
      assert.equal(d.label, src.label, `第 ${i} 维 label 被改了`);
      assert.equal(d.chars, src.chars, `第 ${i} 维 chars 被改了`);
    });
  });

  await t.test('降级确实动了正文（不是原样透出）', () => {
    const redacted = redactingService(getService(), 'inline').reading(BIRTH);
    assert.equal(redacted.status, 'ok');
    if (redacted.status !== 'ok') return;
    const changed = redacted.dimensions.filter((d, i) => d.text !== raw.dimensions[i].text);
    assert.ok(changed.length > 0, '降级后应有维度的正文与原文不同');
  });

  /* ── ③ 输入层：拼给模型的提示词 ─────────────────────────── */
  const question = '我的感情运怎么样？婚姻什么时候稳定下来？';

  await t.test('提示词里受限引文命中数为 0（输入层降级生效）', () => {
    const svc = new AskService({
      service: redactingService(getService(), 'inline'),
      extraSystem: AGENT_SYSTEM_EXTRA,
    });
    const built = svc.buildPrompt(BIRTH, question);
    assert.ok(built, '应能拼出提示词');
    const hits = countCitations(built.prompt.user);
    assert.equal(hits, 0, `提示词里还有 ${hits} 处受限引文`);
  });

  await t.test('反证：不降级时提示词里一定有引文', () => {
    // 证明上面那个 0 是「降级做出来的」，不是「数据本来就没有」。
    const built = new AskService({ service: getService() }).buildPrompt(BIRTH, question);
    assert.ok(built, '应能拼出提示词');
    const hits = countCitations(built.prompt.user);
    assert.ok(hits > 0, `未降级的提示词里应有引文，实际 ${hits} 处 —— 样本可能没覆盖到引文`);
  });

  await t.test('降级后提示词仍注入了盘面事实与原文节选', () => {
    const svc = new AskService({
      service: redactingService(getService(), 'inline'),
      extraSystem: AGENT_SYSTEM_EXTRA,
    });
    const built = svc.buildPrompt(BIRTH, question);
    assert.ok(built, '应能拼出提示词');
    assert.ok(built.prompt.user.includes('十二宫：'), '应注入命盘事实');
    assert.ok(built.prompt.user.includes('[来源：'), '应注入原文节选（降级后的）');
    assert.ok(
      built.prompt.system.includes('眼镜端许可约束'),
      '应追加眼镜端专用的许可约束',
    );
  });

  /* ── ④ 输出层兜底 ───────────────────────────────────────── */
  await t.test('输出层兜底：模型吐出来的引文片段也要被降级', () => {
    const sample = raw.dimensions.find((d) => countCitations(d.text) > 0);
    assert.ok(sample, '样本里应有含引文的维度');
    if (!sample) return;
    const hit = findCitations(sample.text)[0];
    const answer = `你盘里有这么个说法：${sample.text.slice(hit.start, hit.end)}，大概就是这个意思。`;
    assert.ok(countCitations(answer) > 0, '构造的回答里应含引文');
    const cleaned = redactCitations(answer, 'inline');
    assert.equal(countCitations(cleaned), 0, '降级后回答里不应再有引文');
    assert.ok(cleaned.includes('大概就是这个意思'), '降级不应吃掉非引文部分');
  });
};

export default suite;

/**
 * 独立运行：
 *
 *   npx tsx tests/agent_citation.test.ts
 */
if (isMainModule(import.meta.url)) {
  await runStandalone(suite, '眼镜端引文降级');
}
