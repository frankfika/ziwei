/**
 * Echo provider —— **不联网的本地桩**。
 *
 * 用途：开发、单测、以及「没有配任何 API key 时的零成本演练」。
 * 它把拼好的 prompt 原样回吐（可选择打印到 stdout），不产生任何网络请求。
 */

import type { AskProvider, AskRequest, AskResponse } from '../types';

export interface EchoProviderOptions {
  /** 把拼好的 prompt 打到 stdout（默认 false，避免污染库输出）。 */
  print?: boolean;
  /** 自定义回复（测试用）。返回的字符串即作为「模型回答」。 */
  reply?: (req: AskRequest) => string | Promise<string>;
}

export interface EchoProvider extends AskProvider {
  /** 最近一次请求（便于断言「确实走到了 complete()」）。 */
  lastRequest?: AskRequest;
}

const PROVIDER_NAME = 'echo';

/** 创建一个不联网的 echo provider。 */
export function createEchoProvider(opts: EchoProviderOptions = {}): EchoProvider {
  const { print = false, reply } = opts;

  const provider: EchoProvider = {
    name: PROVIDER_NAME,
    lastRequest: undefined,

    async complete(req: AskRequest): Promise<AskResponse> {
      provider.lastRequest = req;

      if (print) {
        // eslint-disable-next-line no-console
        console.log(
          [
            '========== echo provider: system ==========',
            req.system,
            '',
            '========== echo provider: user ==========',
            req.user,
            '========== echo provider: end ==========',
          ].join('\n'),
        );
      }

      const text = reply
        ? await reply(req)
        : [
            '[echo] 未接入真实模型，以下是本次拼好的提示词原文。',
            '',
            '---------- system ----------',
            req.system,
            '',
            '---------- user ----------',
            req.user,
          ].join('\n');

      return {
        text,
        provider: PROVIDER_NAME,
        model: 'echo',
        raw: { echo: true },
      };
    },
  };

  return provider;
}
