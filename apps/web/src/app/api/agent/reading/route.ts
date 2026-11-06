/**
 * 眼镜端解读接口 —— POST /api/agent/reading
 *
 * 服务对象是 Rokid AI 眼镜上的 AIUI 智能体：眼镜端发 JSON body 过来，
 * 期望拿回 13 维解读原文（客户端见 apps/rokid-agent/lib/api.js 的 requestReading）。
 *
 * 边界：
 *  · 解读正文**只从数据集检索**（ZiweiService.reading() → @ziwei/reading-index），
 *    一次模型都不调 —— 眼镜端拿到的每一句断语都必须是数据集原文，不允许模型凭空生成；
 *  · 样本库没覆盖的生辰**如实说没覆盖**，不编造、不静默降级：
 *    返回 status:'not-covered' + core 给的中文说明 + 已建索引的年份；
 *  · 排盘不归这里管（眼镜端本地能算就算，算不动才回落到 /api/agent/chart）。
 */

import { InvalidBirthError, validateBirth } from '@ziwei/chart-engine';
import type { Birth } from '@ziwei/core';

import {
  AGENT_CITATION_MODE_LABEL,
  applyCitationModeToDimensions,
  resolveAgentCitationMode,
} from '@/lib/citations';
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
      // 解读原文是个人隐私数据，不许任何一层缓存
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
 * 检索 13 维解读原文。
 *
 * 两种结局都是 200 —— 「没覆盖」不是服务故障，而是一个必须如实告诉用户的事实，
 * 由 status 字段区分（眼镜端读 status 决定是念原文还是念说明）。
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

  const res = getService().reading(parsed.birth);

  if (res.status === 'not-covered') {
    return json(
      {
        status: 'not-covered',
        key: res.key,
        year: res.year,
        reason: res.reason,
        // message 是 core 写的诚实说明，原样透出，不自己改写
        message: res.message,
        availableYears: res.availableYears,
      },
      200,
    );
  }

  /**
   * 引文降级 —— **必须在下发前做**。
   *
   * 数据集标注 CC BY 4.0，但正文里引用的倪师《天纪》原话属 NC-SA（不可商用）。
   * 眼镜端是要上架 Rokid 商店的公开作品 = 商业分发场景，
   * docs/LEGAL_NOTES.md 第 5 节要求切到 `inline`。
   *
   * 口径：`resolveAgentCitationMode` **默认 inline**，
   * 只有显式 `ZIWEI_CITATION_MODE=full` 才放宽（本地演示用）。
   * 注意不能用 Web 端的 `resolveCitationMode` —— 那个默认 full，会把受限原文原样推出去。
   */
  const mode = resolveAgentCitationMode(process.env.ZIWEI_CITATION_MODE);
  const { dimensions, totalCitations, redactedDims } = applyCitationModeToDimensions(
    res.dimensions,
    mode,
  );

  return json(
    {
      status: 'ok',
      key: res.key,
      // 命宫第一主星：眼镜端用它在界面上标注「这张盘的主角」
      ms: res.ms,
      // 只下发 key / label / text：chars 是服务端统计用的，眼镜端用不上
      dimensions: dimensions.map((d) => ({ key: d.key, label: d.label, text: d.text })),
      // 模式必须让眼镜端能披露 —— 界面要明确告知用户当前拿到的文本是什么形态
      citationMode: mode,
      citationModeLabel: AGENT_CITATION_MODE_LABEL[mode],
      // 服务端统计（眼镜端只用于调试，不展示）
      citationStats: { total: totalCitations, redactedDimensions: redactedDims },
    },
    200,
  );
}
