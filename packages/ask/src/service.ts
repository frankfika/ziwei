/**
 * 追问服务 —— 把 @ziwei/core 的确定性结果接上可插拔的模型端。
 *
 * 流程（严格遵循 docs/ARCHITECTURE.md 的硬规则）：
 *   1. 只用 @ziwei/core 取盘面事实与解读原文（**不允许 LLM 代算盘**）
 *   2. `status === 'not-covered'` → **拒绝**调用模型，原样返回 core 的 message
 *   3. 用 buildAskPrompt 把「盘面事实 + 相关维原文节选 + 硬约束」拼成提示词
 *   4. 调 provider（唯一可能联网的一步）
 *   5. 用 verifyAnswer 做机械防编造检查
 *
 * 两条出口：`ask()` 一次等到全文；`askStream()` 边生成边吐增量（前端能实时显示）。
 * 两者共用同一套准备逻辑（prepare）——**检索与排盘口径不允许有第二种写法**。
 */

import { ZiweiService, chartSummary, liuNianLayer, daXianLayer, type Birth } from '@ziwei/core';
import {
  buildAskPrompt,
  DEFAULT_MAX_CONTEXT_CHARS,
  type AskFocus,
  type AskTurn,
  type BuiltPrompt,
} from './prompt';
import { resolveProviderFromEnv, describeProviderEnv } from './providers/env';
import {
  AskProviderNotConfiguredError,
  type AskProvider,
  type AskStreamingProvider,
  type AskUsage,
} from './types';
import { verifyAnswer, type VerifyAnswerResult } from './verify';

export interface AskServiceOptions {
  /** 注入的应用服务层（默认新建一个 ZiweiService）。 */
  service?: ZiweiService;
  /** 注入模型端；不注入时在 `ask()` 里按环境变量解析。 */
  provider?: AskProvider;
  /** 注入材料的上下文预算（字符）。 */
  maxContextChars?: number;
  /**
   * 传给 provider 的 max_tokens。
   * 默认 8000 —— 思维链模型的思考 token 与正文共用这个预算，给小了正文会空。
   */
  maxTokens?: number;
  /** 传给 provider 的 temperature。 */
  temperature?: number;
}

export type AskResult =
  | {
      status: 'ok';
      /** 模型回答正文 */
      answer: string;
      /** 回答这个问题的 provider 名 */
      provider: string;
      model?: string;
      usage?: AskUsage;
      /** 机械自检结果 */
      verification: VerifyAnswerResult;
      /** 本次实际使用的提示词（便于调试 / 审计） */
      prompt: BuiltPrompt;
      /** 命盘事实（供 UI 二次校验） */
      chart: ReturnType<ZiweiService['chart']>;
      /** 数据集 key */
      readingKey: string;
      /** 实际引用到的维度名 */
      citedDimensions: string[];
    }
  | {
      status: 'not-covered';
      /** core 的 message —— **原样展示，不要自己编** */
      message: string;
      key: string;
      reason: 'year-not-indexed' | 'key-not-found';
      availableYears: number[];
    };

/** 流式出口的事件（`askStream` 产出，路由层转成 SSE）。 */
export type AskStreamEvent =
  | { type: 'delta'; text: string }
  /** 思维链增量（等待期进度展示；不进正文、不参与自检） */
  | { type: 'thinking'; text: string }
  | {
      type: 'done';
      answer: string;
      provider: string;
      model?: string;
      usage?: AskUsage;
      /** 机械自检结果（此时全文已齐，才能判定） */
      verification: VerifyAnswerResult;
      /** 实际引用到的维度名 */
      citedDimensions: string[];
    }
  | { type: 'not-covered'; message: string }
  | { type: 'error'; message: string };

/** 准备阶段的结果：覆盖（不出网）或可问（带提示词）。 */
type Prepared =
  | { status: 'not-covered'; result: Extract<AskResult, { status: 'not-covered' }> }
  | {
      status: 'ready';
      prompt: BuiltPrompt;
      chart: ReturnType<ZiweiService['chart']>;
      readingKey: string;
      dimensions: Extract<ReturnType<ZiweiService['reading']>, { status: 'ok' }>['dimensions'];
    };

export class AskService {
  private readonly service: ZiweiService;
  private readonly provider?: AskProvider;
  private readonly maxContextChars: number;
  private readonly maxTokens?: number;
  private readonly temperature?: number;

  constructor(opts: AskServiceOptions = {}) {
    this.service = opts.service ?? new ZiweiService();
    this.provider = opts.provider;
    this.maxContextChars = opts.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;
    this.maxTokens = opts.maxTokens;
    this.temperature = opts.temperature;
  }

  /**
   * 只拼提示词，不调用模型（便于 Web 端「先给用户看会引用哪些原文」）。
   * 样本库未覆盖时返回 undefined。
   */
  buildPrompt(
    birth: Birth,
    question: string,
  ): { prompt: BuiltPrompt; chart: ReturnType<ZiweiService['chart']> } | undefined {
    const reading = this.service.reading(birth);
    if (reading.status === 'not-covered') return undefined;
    const chart = this.service.chart(birth);
    const prompt = buildAskPrompt({
      birth,
      question,
      chartSummary: chartSummary(chart),
      dimensions: reading.dimensions,
      maxContextChars: this.maxContextChars,
    });
    return { prompt, chart };
  }

  /**
   * ① 解读检索 ② 盘面事实 ③ 拼提示词 —— `ask` 与 `askStream` 共用。
   * 未覆盖时**到此为止**，绝不让模型自由发挥。
   */
  private prepare(
    birth: Birth,
    question: string,
    turns?: AskTurn[],
    options?: { focus?: AskFocus },
  ): Prepared {
    const reading = this.service.reading(birth);
    if (reading.status === 'not-covered') {
      return {
        status: 'not-covered',
        result: {
          status: 'not-covered',
          message: reading.message,
          key: reading.key,
          reason: reading.reason,
          availableYears: reading.availableYears,
        },
      };
    }

    // 盘面事实（确定性引擎）
    const chart = this.service.chart(birth);
    const summary = chartSummary(chart);

    // 运限事实：时间层焦点（流年/大限）由引擎真实计算，绝不编造；
    // 无焦点时也附「当下定位」（当前虚岁 + 所走大限 + 今年流年），让每个回答都能先落在"你现在"
    let fortuneNote: string | undefined;
    if (options?.focus?.time === 'liunian') {
      const y = options.focus.targetYear ?? new Date().getFullYear();
      const ln = liuNianLayer(chart, y);
      const natal = chart.palaces.find((p) => p.branch === ln.mingBranch);
      // 流年十二宫落位：流年某宫落在本命哪一宫
      const placements = ln.palaces
        .map((lp) => {
          const p = chart.palaces.find((c) => c.branch === lp.branch);
          return p ? `${lp.name}在本命${p.name}（${p.branchName}）` : null;
        })
        .filter(Boolean)
        .join('；');
      fortuneNote = [
        `${y} ${ln.ganzhi}年：流年命宫落在本命${natal?.name ?? ''}（${natal?.branchName ?? ''}）。`,
        `流年四化：化禄 ${ln.siHua.lu}、化权 ${ln.siHua.quan}、化科 ${ln.siHua.ke}、化忌 ${ln.siHua.ji}。`,
        `流年十二宫落位：${placements}。`,
      ].join('\n');
    } else if (options?.focus?.time === 'daxian') {
      const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
      const dxIndex = dxPalace
        ? chart.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch)
        : -1;
      const dx = dxIndex >= 0 ? chart.daXians[dxIndex] : undefined;
      const layer = dxIndex >= 0 ? daXianLayer(chart, dxIndex) : null;
      if (dx && layer) {
        const placements = layer.palaces
          .map((lp) => {
            const p = chart.palaces.find((c) => c.branch === lp.branch);
            return p ? `${lp.name}在本命${p.name}（${p.branchName}）` : null;
          })
          .filter(Boolean)
          .join('；');
        fortuneNote = [
          `当前大限 ${dx.startAge}–${dx.endAge} 岁，大限命宫在${dx.palaceName}（${dx.stemName ?? ''}）。`,
          ...(dx.siHua
            ? [
                `大限四化：化禄 ${dx.siHua.lu}、化权 ${dx.siHua.quan}、化科 ${dx.siHua.ke}、化忌 ${dx.siHua.ji}。`,
              ]
            : []),
          `大限十二宫落位：${placements}。`,
        ].join('\n');
      }
    } else {
      const y = new Date().getFullYear();
      const xuSui = y - birth.year + 1;
      const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
      const ln = liuNianLayer(chart, y);
      const natal = chart.palaces.find((p) => p.branch === ln.mingBranch);
      fortuneNote = [
        `当下定位：命主今年虚岁${xuSui}，正走${dxPalace?.daXianAge?.[0] ?? '?'}–${dxPalace?.daXianAge?.[1] ?? '?'}岁的大限（大限命宫落在本命${dxPalace?.name ?? ''}）。`,
        `${y} ${ln.ganzhi}流年：流年命宫在本命${natal?.name ?? ''}（${natal?.branchName ?? ''}），流年四化：化禄 ${ln.siHua.lu}、化权 ${ln.siHua.quan}、化科 ${ln.siHua.ke}、化忌 ${ln.siHua.ji}。`,
      ].join('\n');
    }

    const prompt = buildAskPrompt({
      birth,
      question,
      chartSummary: summary,
      dimensions: reading.dimensions,
      ...(turns && turns.length > 0 ? { turns } : {}),
      ...(options?.focus ? { focus: options.focus } : {}),
      ...(fortuneNote ? { fortuneNote } : {}),
      maxContextChars: this.maxContextChars,
    });

    return {
      status: 'ready',
      prompt,
      chart,
      readingKey: reading.key,
      dimensions: reading.dimensions,
    };
  }

  /** 解析模型端：注入优先，其次环境变量。 */
  private resolveProvider(): AskProvider {
    const provider = this.provider ?? resolveProviderFromEnv();
    if (!provider) {
      const status = describeProviderEnv();
      throw new AskProviderNotConfiguredError(status.message, status.missing);
    }
    return provider;
  }

  /**
   * 追问。
   *
   * @param turns 此会话此前的问答（时间正序），注入提示词帮助模型理解追问语境
   * @throws {AskProviderNotConfiguredError} 未配置任何 provider 时（message 里列出要设的环境变量）
   * @throws {AskProviderError} provider 调用失败
   */
  async ask(
    birth: Birth,
    question: string,
    turns?: AskTurn[],
    options?: { focus?: AskFocus; thinking?: 'enabled' | 'disabled' },
  ): Promise<AskResult> {
    const prepared = this.prepare(birth, question, turns, options);
    if (prepared.status === 'not-covered') return prepared.result;
    const { prompt, chart, readingKey, dimensions } = prepared;

    // ④ 模型端（唯一可能联网的一步）
    const provider = this.resolveProvider();
    const response = await provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
      ...(options?.thinking ? { thinking: options.thinking } : {}),
    });

    // ⑤ 机械防编造检查
    const verification = verifyAnswer(response.text, { chart, dimensions });

    return {
      status: 'ok',
      answer: response.text,
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      verification,
      prompt,
      chart,
      readingKey,
      citedDimensions: prompt.selected.map((d) => d.label),
    };
  }

  /**
   * 流式追问 —— 与 `ask()` 同一条口径，只是模型边写边吐。
   *
   * 好处是前端能实时显示，用户不用对着转圈等十几秒。
   * 注意：**防编造自检要等全文齐了才能判**，所以结论在 `done` 事件里给。
   *
   * provider 不支持流式时（没有 `stream` 方法）→ 退化成一次 `complete()`，
   * 整段作为一个 delta 吐出去，行为与 `ask()` 一致。
   */
  async *askStream(
    birth: Birth,
    question: string,
    turns?: AskTurn[],
    options?: { focus?: AskFocus; thinking?: 'enabled' | 'disabled' },
  ): AsyncGenerator<AskStreamEvent> {
    const prepared = this.prepare(birth, question, turns, options);
    if (prepared.status === 'not-covered') {
      yield { type: 'not-covered', message: prepared.result.message };
      return;
    }
    const { prompt, chart, dimensions } = prepared;

    const provider = this.resolveProvider() as AskStreamingProvider;
    let full = '';
    let model: string | undefined;
    let usage: AskUsage | undefined;

    if (typeof provider.stream !== 'function') {
      // 不支持流式的老 provider：一次问完，整段吐出去
      const response = await provider.complete({
        system: prompt.system,
        user: prompt.user,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        ...(options?.thinking ? { thinking: options.thinking } : {}),
      });
      full = response.text;
      model = response.model;
      usage = response.usage;
      yield { type: 'delta', text: full };
    } else {
      for await (const event of provider.stream({
        system: prompt.system,
        user: prompt.user,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
        ...(options?.thinking ? { thinking: options.thinking } : {}),
      })) {
        if (event.type === 'delta') {
          full += event.text;
          yield { type: 'delta', text: event.text };
        } else if (event.type === 'thinking') {
          yield { type: 'thinking', text: event.text };
        } else if (event.type === 'done') {
          full = event.text || full;
          model = event.model ?? model;
          usage = event.usage ?? usage;
        } else {
          yield { type: 'error', message: event.message };
          return;
        }
      }
    }

    // 全文齐了才判防编造 —— 结论随 done 事件一起给前端
    const verification = verifyAnswer(full, { chart, dimensions });
    yield {
      type: 'done',
      answer: full,
      provider: provider.name,
      model,
      usage,
      verification,
      citedDimensions: prompt.selected.map((d) => d.label),
    };
  }
}
