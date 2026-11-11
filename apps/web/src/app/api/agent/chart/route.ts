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
 *  · 眼镜端没有登录态、跨域来源不可控 → 响应统一带 CORS 头，并实现 OPTIONS 预检
 *    （共享实现见 @/lib/agentHttp，三个 agent 接口只有这一份）；
 *  · 生辰口径与数据集严格一致：时辰是**序号 0–11**（子=0 … 亥=11），不是 0–23 点钟。
 */

import { agentJson, agentOptions, parseBirth } from '@/lib/agentHttp';
import { getService } from '@/lib/service';

export const dynamic = 'force-dynamic';

/** 预检：眼镜端走 fetch 时会先发 OPTIONS，这里必须先放行 */
export function OPTIONS(): Response {
  return agentOptions();
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
    return agentJson({ error: '请求体不是合法的 JSON。' }, 400);
  }

  const parsed = parseBirth(payload);
  if (!parsed.ok) {
    return agentJson({ error: parsed.message }, 400);
  }

  try {
    const chart = getService().chart(parsed.birth);
    return agentJson(chart, 200);
  } catch {
    // 走到这里说明是引擎内部异常（参数已校验过）——不回传内部细节，只给一句可读的话
    return agentJson({ error: '排盘失败，请稍后重试。' }, 500);
  }
}
