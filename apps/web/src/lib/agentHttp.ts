/**
 * 眼镜端（Rokid AIUI 智能体）三个接口共享的 HTTP / 解析工具。
 *
 * 服务对象：/api/agent/chart、/api/agent/reading、/api/agent/ask。
 * 原先这份代码在三个路由里各抄了一份（CORS 头、json 出口、生辰解析），
 * 口径漂移过一次就会出三种行为 —— 所以只许在这里写一次。
 *
 * 边界：
 *  · CORS `*` 只配给「只读不写、不带凭证」的眼镜端接口，站内接口不要复用；
 *  · 生辰校验必须借引擎自己的 validateBirth，不在这里另写一套 ——
 *    引擎认的口径就是数据集认的口径，两边必须一模一样。
 */

import { InvalidBirthError, validateBirth } from '@ziwei/chart-engine';
import type { Birth } from '@ziwei/core';

/**
 * CORS 头 —— 眼镜端的来源不可控（小程序 wx.request / fetch 行为还不一致），
 * 只能放开。三个接口都只读不写，不带凭证，所以 `*` 是安全的。
 */
export const AGENT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 预检：眼镜端走 fetch 时会先发 OPTIONS，这里必须先放行 */
export function agentOptions(): Response {
  return new Response(null, { status: 204, headers: AGENT_CORS_HEADERS });
}

/** 统一 JSON 出口 —— CORS 头与禁缓存策略只在这里写一次，避免漏在某个分支上 */
export function agentJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...AGENT_CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      // 命盘 / 解读 / 问答都是个人隐私数据，不许任何一层缓存
      'cache-control': 'no-store',
    },
  });
}

/** 生辰解析结果 */
export type ParseBirthResult =
  | { ok: true; birth: Birth }
  | { ok: false; message: string };

/**
 * 取整数：设备端理论上发的是 number，但语音识别链路可能把数字转成字符串，
 * 这里一并接受，避免因为类型差异把合法生辰判死。
 */
export function toInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isInteger(v) ? v : null;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * 解析并校验生辰。
 *
 * 范围判定直接借用引擎自己的 validateBirth（@ziwei/chart-engine 导出的权威实现），
 * 不在这里另写一套 —— 引擎认的口径就是数据集认的口径，两边必须一模一样。
 */
export function parseBirth(raw: unknown): ParseBirthResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '请求体必须是一个 JSON 对象。' };
  }
  const o = raw as Record<string, unknown>;

  const missing = (['year', 'month', 'day', 'hour', 'gender'] as const).filter(
    (k) => o[k] === undefined || o[k] === null,
  );
  if (missing.length > 0) {
    return { ok: false, message: '请提供完整的出生参数：year、month、day、hour、gender。' };
  }

  const year = toInt(o.year);
  const month = toInt(o.month);
  const day = toInt(o.day);
  const hour = toInt(o.hour);
  if (year === null || month === null || day === null || hour === null) {
    return { ok: false, message: '出生参数格式不对：year、month、day、hour 需要是整数。' };
  }
  if (o.gender !== 'male' && o.gender !== 'female') {
    return { ok: false, message: '性别需为 male 或 female。' };
  }

  const birth: Birth = { year, month, day, hour, gender: o.gender };
  try {
    validateBirth(birth);
  } catch (err) {
    if (err instanceof InvalidBirthError) {
      return { ok: false, message: err.message };
    }
    throw err;
  }
  return { ok: true, birth };
}
