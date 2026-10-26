'use server';

/**
 * 命盘追问 —— Server Action。
 *
 * 这是 Web 端**唯一**会联网的地方。流程严格遵循 docs/ARCHITECTURE.md：
 *  ① 解读检索（未覆盖就到此为止，绝不让模型自由发挥）
 *  ② 引擎排盘（确定性事实来源）
 *  ③ 拼提示词（盘面事实 + 相关维原文节选 + 硬约束）
 *  ④ 调 provider
 *  ⑤ 机械防编造自检
 *
 * 注意：**排盘与检索都在服务端**，浏览器端不接触引擎与数据集。
 */

import {
  AskService,
  AskProviderNotConfiguredError,
  AskProviderError,
} from '@ziwei/ask';

/** 机械自检结果（结构化传给前端展示） */
export interface AskVerification {
  ok: boolean;
  suspectStars: string[];
  suspectPalaces: string[];
  suspectPlacements: string[];
  warnings: string[];
}

export type AskActionResult =
  | {
      status: 'ok';
      answer: string;
      provider: string;
      model?: string;
      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
      citedDimensions: string[];
      verification: AskVerification;
    }
  | {
      status: 'not-covered';
      message: string;
    }
  | {
      status: 'not-configured';
      message: string;
      missing: string[];
    }
  | {
      status: 'error';
      message: string;
    };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v : '';
}

export async function askChart(formData: FormData): Promise<AskActionResult> {
  const question = str(formData, 'question').trim();
  const year = Number(str(formData, 'year'));
  const month = Number(str(formData, 'month'));
  const day = Number(str(formData, 'day'));
  const hour = Number(str(formData, 'hour'));
  const gender = str(formData, 'gender') === 'female' ? 'female' : 'male';

  if (!question) {
    return { status: 'error', message: '请先写下你的问题。' };
  }
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 11
  ) {
    return { status: 'error', message: '生辰参数不完整，请回到输入页重新排盘。' };
  }

  try {
    const service = new AskService();
    const result = await service.ask({ year, month, day, hour, gender }, question);

    if (result.status === 'not-covered') {
      return { status: 'not-covered', message: result.message };
    }

    const v = result.verification;
    return {
      status: 'ok',
      answer: result.answer,
      provider: result.provider,
      ...(result.model ? { model: result.model } : {}),
      ...(result.usage ? { usage: result.usage } : {}),
      citedDimensions: result.citedDimensions,
      verification: {
        ok: v.ok,
        suspectStars: v.suspectStars ?? [],
        suspectPalaces: v.suspectPalaces ?? [],
        suspectPlacements: v.suspectPlacements ?? [],
        warnings: v.warnings ?? [],
      },
    };
  } catch (err) {
    if (err instanceof AskProviderNotConfiguredError) {
      return {
        status: 'not-configured',
        message: err.message,
        missing: err.missing ?? [],
      };
    }
    if (err instanceof AskProviderError) {
      return { status: 'error', message: err.message };
    }
    return {
      status: 'error',
      message: err instanceof Error ? err.message : '追问失败，请稍后重试。',
    };
  }
}
