/**
 * 后端 API 封装 —— 眼镜端调自有服务端的唯一出口。
 *
 * 为什么要后端：
 *  · 13 维解读数据集有 674,976 张盘（compact 形态 1.5GB），眼镜只有 2GB RAM / 32GB 存储，装不下；
 *  · 解读正文必须来自数据集原文检索，不允许模型凭空生成（项目四条硬规则之一）。
 *
 * 网络上的坑（社区实战 + 官方文档）：
 *  · Rokid 眼镜上的 HTTPS 请求**实际走蓝牙到手机 App**，弱网表现和手机直连不同；
 *  · 浏览器 `fetch` 在真机上会被跨域卡住 → **优先 wx.request**，fetch 只作兜底；
 *  · 眼镜上不能白屏：所有失败都必须静默降级，不抛给用户看技术错误。
 */

/** 后端地址。提审前用真实域名，模拟器联调可临时改这里。 */
export const API_BASE = 'https://ziwei.secondplanet.cc';

/** 单次请求超时（毫秒） */
export const TIMEOUTS = {
  chart: 8000,
  reading: 10000,
  /**
   * 追问的客户端超时。
   *
   * ⚠️ 这个值原来写的是 40 秒，**比服务端先放弃**，实测追问会被自己的超时打断：
   * 2026-11-08 在生产域名实测 `/api/agent/ask` 的响应时间是
   * **41.0s / 49.3s / 16.4s / 23.8s**（随模型负载波动）——
   * 超过 40s 的那两次，客户端 AbortController 先 abort，
   * 界面上表现为「追问暂时不可用，盘面和解读不受影响」，
   * 也就是**核心功能在眼镜上会随机失败**。
   *
   * 服务端 LLM provider 的上限是 180s（openai 兼容）/ 60s（anthropic），
   * 这里取 120s：既盖住实测的最坏情况，又留出余量不让客户端比服务端还执着。
   * 等待期间界面显示「正在推演……」，不白屏。
   */
  ask: 120000,
};

/**
 * 用 AbortController 给 fetch 加超时。
 *
 * @param {string} url
 * @param {{ timeout?: number, method?: string, headers?: Record<string, string>, body?: string }} [options]
 * @returns {Promise<any>}
 */
async function fetchWithTimeout(url, options = {}) {
  const { timeout = 10000, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 统一请求入口：wx.request 优先，失败再退 fetch。
 *
 * @param {string} path
 * @param {Object} payload
 * @param {number} [timeout]
 * @returns {Promise<any>}
 */
export async function postJson(path, payload, timeout = 10000) {
  const url = `${API_BASE}${path}`;

  // 优先走 wx.request（真机不跨域）
  try {
    const wx = await import('wx');
    const mod = wx.default || wx;
    if (mod && typeof mod.request === 'function') {
      const res = await new Promise((resolve, reject) => {
        mod.request({
          url,
          method: 'POST',
          header: { 'content-type': 'application/json' },
          data: payload,
          timeout,
          success: (r) => resolve(r),
          fail: (e) => reject(new Error((e && e.errMsg) || 'wx.request failed')),
        });
      });
      const status = res && res.statusCode;
      if (status && status >= 400) {
        throw new Error(`HTTP ${status}`);
      }
      return res.data;
    }
  } catch (err) {
    // 落到 fetch 兜底
  }

  return fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    timeout,
  });
}

/**
 * 排盘（端侧失败时的服务端回退）。
 *
 * @param {{ year: number, month: number, day: number, hour: number, gender: string }} birth
 * @returns {Promise<Object>} ChartJSON
 */
export function requestChart(birth) {
  return postJson('/api/agent/chart', birth, TIMEOUTS.chart);
}

/**
 * 取 13 维解读原文。
 *
 * @param {{ year: number, month: number, day: number, hour: number, gender: string }} birth
 * @returns {Promise<{ status: string, key?: string, dimensions?: Array<{key: string, label: string, text: string}>, message?: string, citationMode?: string, citationModeLabel?: string }>}
 *   citationModeLabel 是**要在界面上披露**的降级模式说明
 *   （例如「引文已降级（《天纪》原话以「引文略」代替）」）。
 */
export function requestReading(birth) {
  return postJson('/api/agent/reading', birth, TIMEOUTS.reading);
}

/**
 * 基于命盘追问。
 *
 * @param {Object} birth
 * @param {string} question
 * @param {Array<{ question: string, answer: string }>} [turns] 上文
 * @param {Object} [focus] 页内焦点（维度 / 宫位）
 * @returns {Promise<{ answer: string, cited: string[], verification: string, model: string, citationMode?: string, citationModeLabel?: string }>}
 */
export function requestAsk(birth, question, turns = [], focus = {}) {
  return postJson(
    '/api/agent/ask',
    { ...birth, question, turns, focus },
    TIMEOUTS.ask,
  );
}
