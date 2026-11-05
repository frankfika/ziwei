/**
 * @ziwei/ask 单元自测。
 *
 * 运行：npx tsx packages/ask/src/__selftest.ts
 *      （或 npm run selftest --workspace @ziwei/ask）
 *
 * 覆盖验收标准：
 *   1. 词表与基座一致（引擎产出的星/宫名 ⊆ 受控词表）
 *   2. buildAskPrompt 纯函数：注入盘面事实 + 相关维原文节选 + 硬约束，且受预算约束
 *   3. echo provider 全链路：构造 prompt → 调用 → 拿到回答 → verifyAnswer
 *   4. verifyAnswer 能抓到「盘面没有的星曜」
 *   5. verifyAnswer 对「盘面有的星曜」不误报
 *   6. verifyAnswer 能抓到越界宫名
 *   7. 未配置 provider → 明确错误信息（不是崩溃、不是静默空）
 *   8. status === 'not-covered' → 拒绝基于自由知识回答
 *   9. 全程零网络请求（全局 fetch 守卫）
 */

import { netGuard, restoreFetch } from './__netguard'; // ← 必须第一个 import：装上 fetch 守卫
import { ZiweiService, type Birth } from '@ziwei/core';
import {
  buildAskPrompt,
  verifyAnswer,
  AskService,
  createEchoProvider,
  describeProviderEnv,
  resolveProviderFromEnv,
  AskProviderNotConfiguredError,
  AskProviderError,
  createOpenAICompatibleProvider,
  createAnthropicProvider,
  resolveChatCompletionsEndpoint,
  CHART_STAR_NAMES,
  PALACE_NAMES,
  REFERENCE_STAR_NAMES,
} from './index';

// ── 迷你断言框架 ────────────────────────────────────────────
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * 依赖解读数据的断言。
 *
 * 本自测在 CI 里跑，而数据集（53GB）不进 git —— CI 环境没有 `data/`。
 * 没有数据时检索返回 not-covered，依赖正文的断言必然失败 ——
 * 那不是代码坏了，是环境缺数据。所以这里**跳过**而不是判失败，
 * 但跳过数会显式打印，不能悄悄消失。
 */
let hasData = true;

function okWithData(name: string, cond: boolean, detail = '') {
  if (!hasData) {
    skipped += 1;
    console.log(`  ⏭  ${name}（无数据集，跳过）`);
    return;
  }
  ok(name, cond, detail);
}

function section(title: string) {
  console.log(`\n▶ ${title}`);
}

// ── 零网络守卫 ──────────────────────────────────────────────
// 守卫已在 __netguard.ts（第一个 import）里装好，
// 因此「import 本包 / @ziwei/core 时是否联网」也在监控范围内。
const fetchCalls = () => netGuard.calls;

// ── 测试用生辰 ──────────────────────────────────────────────
const BIRTH: Birth = { year: 1990, month: 3, day: 15, hour: 6, gender: 'male' };
/**
 * 未覆盖样本：**1950 之前**的生辰。
 *
 * 注意不要用「已建索引但没这条 key」的年份来测 —— 数据集覆盖 1950–2026
 * 的每个真实日期 × 12 时辰 × 男女，所以 1950–2026 区间内**不存在**
 * 「年份已索引但 key 缺失」的情况。唯一可达的未覆盖分支是
 * 「年份不在已建索引范围内」，所以必须取 1950 之前的年份。
 */
const UNCOVERED_BIRTH: Birth = { year: 1949, month: 3, day: 15, hour: 6, gender: 'male' };

const svc = new ZiweiService();
const chart = svc.chart(BIRTH);
const reading = svc.reading(BIRTH);
const summary = svc.summary(BIRTH);

console.log('紫微助手 · @ziwei/ask 单元自测');
console.log(
  `生辰：${BIRTH.year}-${BIRTH.month}-${BIRTH.day} 时辰${BIRTH.hour} ${BIRTH.gender}`,
);
console.log(`解读状态：${reading.status}｜数据源：${svc.coverage().dataDir}`);
hasData = reading.status === 'ok';
if (!hasData) {
  console.log('（未找到解读数据集：依赖正文的断言将跳过，非零退出码只代表真失败）');
}

// ═══════════════════════════════════════════════════════════
section('1. 受控词表与基座一致（引擎产出 ⊆ 词表）');

{
  const engineStars = new Set<string>();
  const enginePalaces = new Set<string>();
  const births: Birth[] = [];
  for (const y of [1950, 1985, 1990, 2000, 2010, 2020, 2026]) {
    for (const m of [1, 5, 9]) {
      for (const d of [3, 17, 26]) {
        for (let h = 0; h < 12; h += 2) {
          for (const g of ['male', 'female'] as const) {
            births.push({ year: y, month: m, day: d, hour: h, gender: g });
          }
        }
      }
    }
  }
  for (const b of births) {
    const c = svc.chart(b);
    for (const p of c.palaces) {
      enginePalaces.add(p.name);
      for (const s of p.stars) engineStars.add(s.name);
    }
  }
  const starsMissing = [...engineStars].filter((s) => !CHART_STAR_NAMES.includes(s));
  const palacesMissing = [...enginePalaces].filter(
    (p) => !PALACE_NAMES.includes(p) && !PALACE_NAMES.includes(p.replace(/宫$/, '')),
  );
  ok(
    `引擎 ${engineStars.size} 个星名全部在受控词表内（抽样 ${births.length} 张盘）`,
    starsMissing.length === 0,
    starsMissing.join('、'),
  );
  ok(
    `引擎 ${enginePalaces.size} 个宫名全部在十二宫名单内`,
    palacesMissing.length === 0,
    palacesMissing.join('、'),
  );
  ok(
    `参照系 ${REFERENCE_STAR_NAMES.length} > 引擎星名 ${CHART_STAR_NAMES.length}（存在可抓的盘外星名）`,
    REFERENCE_STAR_NAMES.length > CHART_STAR_NAMES.length,
  );
}

// ═══════════════════════════════════════════════════════════
section('2. buildAskPrompt：纯函数 + 注入盘面事实/原文节选/硬约束');

const dimensions = reading.status === 'ok' ? reading.dimensions : [];
// 无数据集（CI 环境）时给一组最小合成维度：焦点置顶逻辑（section 2c）不依赖
// 数据集原文，没有原文就不该跳过 —— 之前 CI 里这三项断言静默落空。
const dimsForFocus =
  dimensions.length > 0
    ? dimensions
    : [
        { key: 'career', label: '事业', text: '事业维原文样例，用于焦点置顶断言。' },
        { key: 'love', label: '感情', text: '感情维原文样例，用于焦点置顶断言。' },
        { key: 'overview', label: '总览', text: '总览维原文样例，用于兜底断言。' },
      ];
const prompt = buildAskPrompt({
  birth: BIRTH,
  question: '我的感情运怎么样？婚姻什么时候稳定下来？',
  chartSummary: summary,
  dimensions,
  maxContextChars: 8000,
});

{
  ok('注入了命盘事实（十二宫 + 命主/身主）', prompt.user.includes('十二宫：'));
  ok(
    '注入了硬约束（禁止发明星曜/宫位）',
    prompt.system.includes('不得提及') && prompt.system.includes('【命盘事实】'),
  );
  ok(
    '注入了「不做医疗/投资/法律建议」约束',
    prompt.system.includes('医疗') && prompt.system.includes('法律'),
  );
  ok('注入了「不断言注定」约束', prompt.system.includes('注定'));
  okWithData(
    '注入了原文节选并带来源标注',
    prompt.user.includes('[来源：') && prompt.user.includes('key='),
  );
  okWithData(
    '问题关键词命中了「感情」维',
    prompt.selected.some((d) => d.key === 'love' && d.matched),
    JSON.stringify(prompt.selected.map((d) => [d.key, d.matched])),
  );
  ok(
    `上下文预算生效（${prompt.contextChars} ≤ ${prompt.maxContextChars}）`,
    prompt.contextChars <= prompt.maxContextChars,
  );
  ok(
    '截断的维度标记了 truncated 并给出原文起止',
    prompt.selected.every((d) => d.truncated
      ? d.endChar > d.startChar && d.endChar <= d.totalChars
      : true),
  );
  ok('buildAskPrompt 不产生网络请求', fetchCalls() === 0, `fetchCalls=${fetchCalls()}`);
}

// ═══════════════════════════════════════════════════════════
section('2c. buildAskPrompt：页内焦点（focus）置顶注入');

{
  // 问题里不含任何关键词，但显式焦点是事业维 → 事业必须被选中且排最前
  const focused = buildAskPrompt({
    birth: BIRTH,
    question: '帮我看看这方面原文怎么说的？',
    chartSummary: summary,
    dimensions: dimsForFocus,
    focus: { dimension: 'career' },
    maxContextChars: 8000,
  });
  okWithData(
    '焦点维度无关键词也命中',
    focused.selected.some((d) => d.key === 'career' && d.matched),
    JSON.stringify(focused.selected.map((d) => [d.key, d.matched])),
  );
  ok('焦点维度排第一', focused.selected[0]?.key === 'career', focused.selected[0]?.key);

  // 宫位焦点：夫妻 → 映射到 love 维置顶
  const byPalace = buildAskPrompt({
    birth: BIRTH,
    question: '帮我看看我的夫妻宫。',
    chartSummary: summary,
    dimensions: dimsForFocus,
    focus: { palace: '夫妻' },
    maxContextChars: 8000,
  });
  ok('宫位焦点映射到对应维度', byPalace.selected[0]?.key === 'love', byPalace.selected[0]?.key);

  // 未知焦点值不报错、不影响正常选择
  const unknown = buildAskPrompt({
    birth: BIRTH,
    question: '我的感情运怎么样？',
    chartSummary: summary,
    dimensions: dimsForFocus,
    focus: { dimension: 'no-such-dim', palace: '不存在的宫' },
    maxContextChars: 8000,
  });
  ok(
    '未知焦点被忽略、走关键词命中',
    unknown.selected.some((d) => d.key === 'love' && d.matched),
  );

  // 运限事实（流年/大限）作为独立块注入，且计入预算
  const withNote = buildAskPrompt({
    birth: BIRTH,
    question: '今年流年如何？',
    chartSummary: summary,
    dimensions,
    focus: { time: 'liunian', targetYear: 2026 },
    fortuneNote: '2026 丙午年：流年命宫在子宫。\n流年四化：化禄 天同、化权 天机、化科 文昌、化忌 廉贞。',
    maxContextChars: 8000,
  });
  ok(
    '运限事实独立成块注入',
    withNote.user.includes('【运限事实】') && withNote.user.includes('流年命宫在子宫'),
  );
  ok(
    `运限事实计入上下文预算（${withNote.contextChars} ≤ ${withNote.maxContextChars}）`,
    withNote.contextChars <= withNote.maxContextChars,
  );
}

// ═══════════════════════════════════════════════════════════
section('2b. buildAskPrompt：对话上文注入与预算');

{
  const withTurns = buildAskPrompt({
    birth: BIRTH,
    question: '那财运方面呢？',
    chartSummary: summary,
    dimensions,
    turns: [
      { question: '我的感情运怎么样？', answer: '感情上原文提到配偶开朗细腻，建议晚婚。（来源：感情）' },
      { question: '事业方向？', answer: '适合文职、教职或大机构。'.repeat(200) }, // 超长回答应被截断
    ],
    maxContextChars: 8000,
  });
  ok('注入了对话上文块', withTurns.user.includes('【对话上文】'));
  ok(
    '上文包含此前问答',
    withTurns.user.includes('我的感情运怎么样？') && withTurns.user.includes('建议晚婚'),
  );
  ok(
    '超长上文回答被截断（≤500 字）',
    !withTurns.user.includes('适合文职、教职或大机构。'.repeat(200)),
  );
  ok(
    `上文计入上下文预算（${withTurns.contextChars} ≤ ${withTurns.maxContextChars}）`,
    withTurns.contextChars <= withTurns.maxContextChars,
  );
  ok(
    '上文只作为语境的硬约束已进入 system',
    withTurns.system.includes('对话上文') && withTurns.system.includes('不是可引用材料'),
  );
  ok(
    '最新问题在 prompt 末尾（模型注意力）',
    withTurns.user.lastIndexOf('【用户问题】') > withTurns.user.indexOf('【对话上文】'),
  );

  const noTurns = buildAskPrompt({
    birth: BIRTH,
    question: '财运如何？',
    chartSummary: summary,
    dimensions,
  });
  ok('不传 turns 时无对话上文块（向后兼容）', !noTurns.user.includes('【对话上文】'));

  const manyTurns = buildAskPrompt({
    birth: BIRTH,
    question: '健康呢？',
    chartSummary: summary,
    dimensions,
    turns: Array.from({ length: 12 }, (_, i) => ({
      question: `第${i + 1}问`,
      answer: `第${i + 1}答`,
    })),
  });
  ok(
    '上文最多带最近 6 轮',
    manyTurns.user.includes('第12问') && !manyTurns.user.includes('第6问'),
  );
}

// ═══════════════════════════════════════════════════════════
section('3. echo provider 全链路（构造 prompt → 调用 → 回答 → verifyAnswer）');

const echo = createEchoProvider({
  reply: () =>
    '你的命宫在酉宫，主星天机、巨门。（来源：性格）感情上原文提到配偶开朗细腻，建议晚婚。',
});
const askService = new AskService({ service: svc, provider: echo });

{
  const result = await askService.ask(BIRTH, '我的感情运怎么样？');
  okWithData('追问返回 status=ok', result.status === 'ok');
  if (result.status === 'ok') {
    ok('拿到了回答正文', result.answer.length > 0);
    ok('拿到了 provider 名', result.provider === 'echo');
    ok(
      '拿到了机械自检结果',
      typeof result.verification.ok === 'boolean' &&
        Array.isArray(result.verification.suspectStars) &&
        Array.isArray(result.verification.suspectPalaces),
    );
    ok(
      'echo provider 确实收到了拼好的提示词',
      (echo.lastRequest?.user ?? '').includes('【用户问题】') &&
        (echo.lastRequest?.system ?? '').includes('硬约束'),
    );
    ok(
      '回答里只有盘面内的星曜 → 不误报',
      result.verification.suspectStars.length === 0,
      `suspectStars=${JSON.stringify(result.verification.suspectStars)}`,
    );
    ok(
      '回答里落宫正确 → 不误报',
      result.verification.suspectPlacements.length === 0,
      `suspectPlacements=${JSON.stringify(result.verification.suspectPlacements)}`,
    );

    // 回归守卫：整段提示词本身（盘面事实 + 原文节选）必须零误报
    const promptCheck = verifyAnswer(prompt.system + '\n' + prompt.user, {
      chart,
      dimensions,
    });
    ok(
      '整段提示词零误报（盘面事实 + 原文节选）',
      promptCheck.suspectStars.length === 0 &&
        promptCheck.suspectPalaces.length === 0 &&
        promptCheck.suspectPlacements.length === 0,
      `stars=${JSON.stringify(promptCheck.suspectStars)} palaces=${JSON.stringify(
        promptCheck.suspectPalaces,
      )} placements=${JSON.stringify(promptCheck.suspectPlacements)}`,
    );
  }
  ok('全链路仍零网络请求', fetchCalls() === 0, `fetchCalls=${fetchCalls()}`);
}

// ═══════════════════════════════════════════════════════════
section('4. verifyAnswer：抓「盘面没有的星曜」');

{
  // 引擎每张盘都摆齐 70 星，所以「盘外星」必须取自参照系里引擎不摆的名字。
  const absentStar = REFERENCE_STAR_NAMES.find((s) => !CHART_STAR_NAMES.includes(s))!;
  const answer = `根据盘面，你的命宫有${absentStar}星加持，格外不同凡响。`;
  const r = verifyAnswer(answer, { chart, dimensions });
  ok(
    `盘外星曜「${absentStar}」被抓到（suspectStars）`,
    r.suspectStars.includes(absentStar),
    `suspectStars=${JSON.stringify(r.suspectStars)}`,
  );
  ok(`ok=false`, r.ok === false);
  ok(
    '给出了中文告警',
    r.warnings.some((w) => w.includes(absentStar)),
    JSON.stringify(r.warnings),
  );

  // 盘面有的星曜 → 不误报
  const present = chart.palaces[0].stars[0].name;
  const r2 = verifyAnswer(`你的${present}星在盘中有位置。`, { chart, dimensions });
  ok(
    `盘内星曜「${present}」不误报`,
    r2.suspectStars.length === 0,
    `suspectStars=${JSON.stringify(r2.suspectStars)}`,
  );

  // 全部 70 个盘内星名逐个回扫 → 一个都不该误报
  const allIn = [...CHART_STAR_NAMES]
    .map((s) => `盘中有${s}。`)
    .join('');
  const r3 = verifyAnswer(allIn, { chart, dimensions });
  ok(
    '逐个回扫 70 个盘内星名，零误报',
    r3.suspectStars.length === 0,
    `suspectStars=${JSON.stringify(r3.suspectStars)}`,
  );
}

// ═══════════════════════════════════════════════════════════
section('5. verifyAnswer：抓越界宫名');

{
  const r = verifyAnswer('你的太阴宫坐武曲，主事业。', { chart, dimensions });
  ok(
    '星名当宫名（「太阴宫」）被抓到',
    r.suspectPalaces.includes('太阴宫'),
    `suspectPalaces=${JSON.stringify(r.suspectPalaces)}`,
  );
  ok('ok=false', r.ok === false);

  const r2 = verifyAnswer('你的命宫在酉宫，主星天机。', { chart, dimensions });
  ok(
    '地支宫「酉宫」不误报',
    r2.suspectPalaces.length === 0,
    `suspectPalaces=${JSON.stringify(r2.suspectPalaces)}`,
  );

  const r3 = verifyAnswer('你的交友宫有天姚。', { chart, dimensions });
  ok(
    '别名「交友宫」（= 仆役宫）不误报',
    r3.suspectPalaces.length === 0,
    `suspectPalaces=${JSON.stringify(r3.suspectPalaces)}`,
  );
}

// ═══════════════════════════════════════════════════════════
section('6. verifyAnswer：抓落宫错误（引擎每盘都齐 70 星时的兜底）');

{
  // 贪狼在兄弟宫（见盘面事实），若回答说它在命宫 → 落宫不符
  const r = verifyAnswer('你的贪狼在命宫。', { chart, dimensions });
  ok(
    '落宫断言与盘面不符被抓到',
    r.suspectPlacements.length > 0,
    `suspectPlacements=${JSON.stringify(r.suspectPlacements)}`,
  );
  ok('ok=false', r.ok === false);

  // 正确落宫 → 不误报
  const actualPalace = chart.palaces.find((p) =>
    p.stars.some((s) => s.name === '贪狼'),
  )!.name;
  const r2 = verifyAnswer(`你的贪狼在${actualPalace}。`, { chart, dimensions });
  ok(
    `正确落宫「贪狼在${actualPalace}」不误报`,
    r2.suspectPlacements.length === 0,
    `suspectPlacements=${JSON.stringify(r2.suspectPlacements)}`,
  );
}

// ═══════════════════════════════════════════════════════════
section('7. 未配置 provider → 明确错误信息');

{
  const saved = { ...process.env };
  delete process.env.ZIWEI_ASK_PROVIDER;
  delete process.env.ZIWEI_ASK_BASE_URL;
  delete process.env.ZIWEI_ASK_API_KEY;
  delete process.env.ZIWEI_ASK_MODEL;

  const status = describeProviderEnv(process.env);
  ok('describeProviderEnv 判定为未配置', status.ok === false);
  ok(
    '明确指出缺 ZIWEI_ASK_PROVIDER',
    status.missing.includes('ZIWEI_ASK_PROVIDER'),
    JSON.stringify(status.missing),
  );
  ok(
    '错误信息里含环境变量名（便于用户自助）',
    status.message.includes('ZIWEI_ASK_PROVIDER'),
    status.message,
  );
  ok('resolveProviderFromEnv 返回 undefined', resolveProviderFromEnv(process.env) === undefined);

  const bare = new AskService({ service: svc });
  let caught: unknown;
  try {
    await bare.ask(BIRTH, '测试');
  } catch (err) {
    caught = err;
  }
  okWithData(
    '调用方拿到明确的 AskProviderNotConfiguredError（不是崩溃也不是空返回）',
    caught instanceof AskProviderNotConfiguredError,
    String(caught),
  );
  okWithData(
    '错误信息说明需要设哪些环境变量',
    caught instanceof AskProviderNotConfiguredError &&
      caught.message.includes('ZIWEI_ASK_PROVIDER'),
    caught instanceof Error ? caught.message : '',
  );

  // 只配了 provider、缺 key → 也要指出缺哪个
  process.env.ZIWEI_ASK_PROVIDER = 'openai';
  const partial = describeProviderEnv(process.env);
  ok(
    '部分配置时精确指出缺失项',
    partial.missing.includes('ZIWEI_ASK_API_KEY') &&
      partial.missing.includes('ZIWEI_ASK_MODEL'),
    JSON.stringify(partial.missing),
  );

  process.env = saved;
}

// ═══════════════════════════════════════════════════════════
section('8. not-covered → 拒绝基于自由知识回答');

{
  const r = svc.reading(UNCOVERED_BIRTH);
  ok('基座返回 status=not-covered', r.status === 'not-covered');

  let modelCalled = false;
  const spy = createEchoProvider({
    reply: () => {
      modelCalled = true;
      return '编造的内容';
    },
  });
  const service = new AskService({ service: svc, provider: spy });
  const result = await service.ask(UNCOVERED_BIRTH, '我的命运如何？');

  ok('追问返回 status=not-covered', result.status === 'not-covered');
  ok('没有调用模型（modelCalled=false）', modelCalled === false);
  if (result.status === 'not-covered') {
    ok(
      '明确告知「样本库未覆盖」',
      result.message.includes('样本库未覆盖'),
      result.message,
    );
    ok(
      'message 与 core 的 message 原样一致（不自己编）',
      result.message === (r.status === 'not-covered' ? r.message : ''),
    );
  }
}

// ═══════════════════════════════════════════════════════════
section('9. provider 请求/响应协议（注入 fetchImpl，零网络）');

{
  // ── OpenAI 兼容 ──
  let captured: { url: string; init: RequestInit } | undefined;
  const openai = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com',
    apiKey: 'test-key-not-real',
    model: 'test-model',
    fetchImpl: (async (url: any, init: any) => {
      captured = { url: String(url), init };
      return new Response(
        JSON.stringify({
          model: 'test-model',
          choices: [{ message: { content: '来自 OpenAI 兼容端点的回答' } }],
          usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch,
  });

  const res = await openai.complete({ system: 'S', user: 'U', maxTokens: 256 });
  ok('OpenAI 兼容：拿到正文', res.text === '来自 OpenAI 兼容端点的回答', res.text);
  ok('OpenAI 兼容：解析 token 用量', res.usage?.totalTokens === 33);
  ok(
    'OpenAI 兼容：端点拼成 /v1/chat/completions',
    captured?.url === 'https://api.example.com/v1/chat/completions',
    captured?.url,
  );
  const hdrs = (captured?.init.headers ?? {}) as Record<string, string>;
  ok('OpenAI 兼容：带 Bearer 认证头', hdrs.authorization === 'Bearer test-key-not-real');
  const body = JSON.parse(String(captured?.init.body));
  ok(
    'OpenAI 兼容：请求体是 system/user 两条 message',
    body.messages?.[0]?.role === 'system' &&
      body.messages?.[1]?.role === 'user' &&
      body.messages?.[1]?.content === 'U',
    JSON.stringify(body.messages),
  );
  ok('OpenAI 兼容：透传 model 与 max_tokens', body.model === 'test-model' && body.max_tokens === 256);

  // ── Anthropic ──
  let capturedA: { url: string; init: RequestInit } | undefined;
  const anthropic = createAnthropicProvider({
    apiKey: 'test-key-not-real',
    model: 'claude-test',
    fetchImpl: (async (url: any, init: any) => {
      capturedA = { url: String(url), init };
      return new Response(
        JSON.stringify({
          model: 'claude-test',
          content: [{ type: 'text', text: '来自 Anthropic 的回答' }],
          usage: { input_tokens: 5, output_tokens: 7 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch,
  });

  const resA = await anthropic.complete({ system: 'S', user: 'U' });
  ok('Anthropic：拿到正文', resA.text === '来自 Anthropic 的回答', resA.text);
  ok(
    'Anthropic：端点是 /v1/messages',
    capturedA?.url === 'https://api.anthropic.com/v1/messages',
    capturedA?.url,
  );
  const hdrsA = (capturedA?.init.headers ?? {}) as Record<string, string>;
  ok('Anthropic：带 x-api-key 头', hdrsA['x-api-key'] === 'test-key-not-real');
  ok(
    'Anthropic：带 anthropic-version 头',
    hdrsA['anthropic-version'] === '2023-06-01',
  );
  const bodyA = JSON.parse(String(capturedA?.init.body));
  ok(
    'Anthropic：system 独立字段 + user message',
    bodyA.system === 'S' && bodyA.messages?.[0]?.role === 'user',
    JSON.stringify(bodyA),
  );

  // ── endpoint 拼接规则 ──
  ok(
    'endpoint：裸域名补 /v1',
    resolveChatCompletionsEndpoint('https://api.openai.com') ===
      'https://api.openai.com/v1/chat/completions',
  );
  ok(
    'endpoint：已带 /v1 不重复补',
    resolveChatCompletionsEndpoint('https://openrouter.ai/api/v1') ===
      'https://openrouter.ai/api/v1/chat/completions',
  );
  ok(
    'endpoint：智谱 /v4 形态不补 /v1',
    resolveChatCompletionsEndpoint('https://open.bigmodel.cn/api/paas/v4') ===
      'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  );
  ok(
    'endpoint：Ollama /v1',
    resolveChatCompletionsEndpoint('http://localhost:11434/v1') ===
      'http://localhost:11434/v1/chat/completions',
  );

  // ── 错误路径 ──
  const failing = createOpenAICompatibleProvider({
    baseUrl: 'https://api.example.com',
    model: 'm',
    fetchImpl: (async () =>
      new Response('rate limited', { status: 429 })) as unknown as typeof fetch,
  });
  let caught: unknown;
  try {
    await failing.complete({ system: 's', user: 'u' });
  } catch (err) {
    caught = err;
  }
  ok(
    'HTTP 错误 → AskProviderError（带 status）',
    caught instanceof AskProviderError && (caught as AskProviderError).status === 429,
    String(caught),
  );
}

// ═══════════════════════════════════════════════════════════
section('10. 全程零网络请求');

{
  ok(`fetch 被调用 ${fetchCalls()} 次（import 阶段 + 全流程）`, fetchCalls() === 0);
  ok(
    `被拦截的 URL：${netGuard.urls.length ? netGuard.urls.join(', ') : '（无）'}`,
    netGuard.urls.length === 0,
  );
  restoreFetch();
}

// ── 汇总 ────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(64));
if (failed === 0) {
  console.log(
    `✅ 全部通过：${passed} 项断言，0 失败${skipped ? `，${skipped} 项因无数据集跳过` : ''}`,
  );
  process.exit(0);
} else {
  console.log(`❌ 通过 ${passed} 项，失败 ${failed} 项${skipped ? `，跳过 ${skipped} 项` : ''}：`);
  for (const f of failures) console.log(`   · ${f}`);
  process.exit(1);
}
