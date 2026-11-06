/**
 * 眼镜端排盘接口 —— POST /api/agent/chart
 *
 * 服务对象是 Rokid AI 眼镜上的 AIUI 智能体：眼镜端发 JSON body 过来，
 * 期望直接拿回 ChartJSON（客户端见 apps/rokid-agent/lib/api.js 的 requestChart）。
 *
 * 边界：
 *  · 排盘**只走** ZiweiService.chart()（底层 @ziwei/chart-engine 确定性引擎）——
 *    任何情况下都不允许 LLM 代算盘；
 *  · 本接口只排盘：13 维解读在 /api/agent/reading，追问在 /api/agent/ask，
 *    这里一次模型都不碰（眼镜端要的是「算得快」，不是「说得巧」）；
 *  · 眼镜端没有登录态、跨域来源不可控 → 响应统一带 CORS 头，并实现 OPTIONS 预检；
 *  · 生辰口径与数据集严格一致：时辰是**序号 0–11**（子=0 … 亥=11），不是 0–23 点钟。
 */

import { InvalidBirthError, validateBirth } from '@ziwei/chart-engine';
import type { Birth } from '@ziwei/core';

import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

/**
 * CORS 头 —— 眼镜端的来源不可控（小程序 wx.request / fetch 行为还不一致），
 * 只能放开。三个接口都只读不写，不带凭证，所以 `*` 是安全的。
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** 预检：眼镜端走 fetch 时会先发 OPTIONS，这里必须先放行 */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 统一 JSON 出口 —— CORS 头与禁缓存策略只在这里写一次，避免漏在某个分支上 */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      // 命盘是个人隐私数据，不许任何一层缓存
      'cache-control': 'no-store',
    },
  });
}

/** 生辰解析结果 */
type ParseResult =
  | { ok: true; birth: Birth }
  | { ok: false; message: string };

/**
 * 取整数：设备端理论上发的是 number，但语音识别链路可能把数字转成字符串，
 * 这里一并接受，避免因为类型差异把合法生辰判死。
 */
function toInt(v: unknown): number | null {
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
function parseBirth(raw: unknown): ParseResult {
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

/**
 * 排盘。
 *
 * 响应体就是 ChartJSON 本身（客户端按这个形状直接取 palaces / daXians），
 * 不额外包一层信封 —— 眼镜端拿到的必须是引擎的原始输出，不能被二次加工。
 */
export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: '请求体不是合法的 JSON。' }, 400);
  }

  const parsed = parseBirth(payload);
  if (!parsed.ok) {
    return json({ error: parsed.message }, 400);
  }

  try {
    const chart = getService().chart(parsed.birth);
    return json(chart, 200);
  } catch {
    // 走到这里说明是引擎内部异常（参数已校验过）——不回传内部细节，只给一句可读的话
    return json({ error: '排盘失败，请稍后重试。' }, 500);
  }
}
