/**
 * 追问服务 —— 把 @ziwei/core 的确定性结果接上可插拔的模型端。
 *
 * 流程（严格遵循 docs/ARCHITECTURE.md 的硬规则）：
 *   1. 只用 @ziwei/core 取盘面事实与解读原文（**不允许 LLM 代算盘**）
 *   2. `status === 'not-covered'` → **拒绝**调用模型，原样返回 core 的 message
 *   3. 用 buildAskPrompt 把「盘面事实 + 相关维原文节选 + 硬约束」拼成提示词
 *   4. 调 provider（唯一可能联网的一步）
 *   5. 用 verifyAnswer 做机械防编造检查
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
      /** 回答的 provider 名 */
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
   * 追问。
   *
   * @param turns 本会话此前的问答（时间正序），注入提示词帮助模型理解追问语境
   * @throws {AskProviderNotConfiguredError} 未配置任何 provider 时（message 里列出要设的环境变量）
   * @throws {AskProviderError} provider 调用失败
   */
  async ask(
    birth: Birth,
    question: string,
    turns?: AskTurn[],
    options?: { focus?: AskFocus },
  ): Promise<AskResult> {
    // ① 解读检索 —— 未覆盖就到此为止，绝不让模型自由发挥
    const reading = this.service.reading(birth);
    if (reading.status === 'not-covered') {
      return {
        status: 'not-covered',
        message: reading.message,
        key: reading.key,
        reason: reading.reason,
        availableYears: reading.availableYears,
      };
    }

    // ② 盘面事实（确定性引擎）
    const chart = this.service.chart(birth);
    const summary = chartSummary(chart);

    // ②b 运限事实：时间层焦点（流年/大限）由引擎真实计算，绝不编造
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
    }

    // ③ 拼提示词
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

    // ④ 模型端（唯一可能联网的一步）
    const provider = this.provider ?? resolveProviderFromEnv();
    if (!provider) {
      const status = describeProviderEnv();
      throw new AskProviderNotConfiguredError(status.message, status.missing);
    }

    const response = await provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.maxTokens,
      temperature: this.temperature,
    });

    // ⑤ 机械防编造检查
    const verification = verifyAnswer(response.text, {
      chart,
      dimensions: reading.dimensions,
    });

    return {
      status: 'ok',
      answer: response.text,
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      verification,
      prompt,
      chart,
      readingKey: reading.key,
      citedDimensions: prompt.selected.map((d) => d.label),
    };
  }
}
