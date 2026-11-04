/**
 * @ziwei/ask —— 追问层的公共类型。
 *
 * 设计原则：
 *  · **零硬编码 provider**。所有模型端都实现同一个 `AskProvider`，
 *    调用方按需注入；本模块不内置任何默认 provider，也不会在 import 时联网。
 *  · **网络只在 `complete()` 里发生**。构造 provider 不产生任何 IO。
 *  · **提示词构造是纯函数**，便于单测与复用（见 prompt.ts）。
 */

/** 一次追问请求：系统约束 + 用户消息（含注入的盘面事实与原文节选）。 */
export interface AskRequest {
  /** 系统提示（硬约束）。 */
  system: string;
  /** 用户提示（问题 + 材料）。 */
  user: string;
  /** 最大输出 token（provider 可选支持）。 */
  maxTokens?: number;
  /** 采样温度。 */
  temperature?: number;
  /**
   * 思考模式开关（`'enabled'` / `'disabled'`）。
   * 目前只有 DeepSeek 系端点认这个字段；不传或传给不认识的 provider 时按其默认行为。
   */
  thinking?: 'enabled' | 'disabled';
  /** 中断信号（超时 / 取消）。 */
  signal?: AbortSignal;
  /** 透传元数据（不参与提示词）。 */
  metadata?: Record<string, string>;
}

/** token 用量（provider 能拿到就填）。 */
export interface AskUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 一次追问的回答。 */
export interface AskResponse {
  /** 模型返回的正文。 */
  text: string;
  /** 回答这个问题的 provider 名字。 */
  provider: string;
  /** 模型标识。 */
  model?: string;
  /** token 用量。 */
  usage?: AskUsage;
  /** provider 原始响应（调试用）。 */
  raw?: unknown;
}

/**
 * 模型端接口 —— 本包唯一的扩展点。
 *
 * 实现约定：
 *  · 构造时**不得**发起网络请求。
 *  · 失败时抛 `AskProviderError`（带 provider 名与 HTTP status）。
 */
export interface AskProvider {
  /** provider 标识（如 `openai-compatible` / `anthropic` / `echo`）。 */
  name: string;
  /** 执行一次补全。 */
  complete(req: AskRequest): Promise<AskResponse>;
}

/** 流式事件：正文增量 / 收尾（含自检结论）/ 失败。 */
export type AskStreamEvent =
  | { type: 'delta'; text: string }
  | {
      /** 思维链增量（模型「正在想」的过程）——只用于等待期的进度展示，不进正文、不入库 */
      type: 'thinking';
      text: string;
    }
  | {
      type: 'done';
      /** 完整正文（去思维链后） */
      text: string;
      model?: string;
      usage?: AskUsage;
    }
  | { type: 'error'; message: string };

/**
 * 支持流式的模型端。
 *
 * 与 `AskProvider` 的区别只在多一个 `stream()`：`complete()` 一次等到全文，
 * `stream()` 边生成边吐增量 —— 前端才能在模型还在写的时候就把字显示出来。
 */
export interface AskStreamingProvider extends AskProvider {
  /**
   * 流式补全。
   *
   * 约定：
   *  · 正文增量走 `delta`；思维链（若有）走独立的 `thinking` 事件，绝不混进 delta ——
   *    正文是口径，思维链只是等待期的进度展示；
   *  · 正常结束必须 yield 一个 `done` 事件；
   *  · 出错 yield 一个 `error` 事件（不要直接抛 —— 已经吐出去的字收不回来）。
   */
  stream(req: AskRequest): AsyncGenerator<AskStreamEvent>;
}

/** provider 调用失败。 */
export class AskProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    opts: { provider: string; status?: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'AskProviderError';
    this.provider = opts.provider;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

/**
 * 未配置 provider 时抛出。
 * `message` 里明确列出需要设置的环境变量；`missing` 供 UI 精确提示。
 */
export class AskProviderNotConfiguredError extends Error {
  readonly missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = 'AskProviderNotConfiguredError';
    this.missing = missing;
  }
}
