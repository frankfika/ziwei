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

import { toPlainText } from './plain-text.js';

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
      const err = new Error(`HTTP ${response.status}`);
      /** 5xx 值得重试（服务端瞬时过载），4xx 不值得（请求本身有问题） */
      err.isServerError = response.status >= 500;
      throw err;
    }
    return await response.json();
  } catch (err) {
    /**
     * 超时要**打标记**，不能和「网络断了」混为一谈：
     * 超时说明后端已经跑了很久，用户也等了很久 ⇒ 再重试一次只是让等待翻倍；
     * 网络抖动 / 5xx 才是「再来一次就好」的情况。
     */
    if (err && err.name === 'AbortError') {
      const timeoutErr = new Error(`请求超时（${timeout}ms）`);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
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
        const err = new Error(`HTTP ${status}`);
        err.isServerError = status >= 500;
        throw err;
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
 * ⚠️ **正文在这里就被洗成纯文本**（`lib/plain-text.js`）：
 * 后端返回的是带 Markdown 的富文本（`**【福德总览】**`、`## ✦ 标题`、🟢🔵🔴🟡），
 * 而眼镜是**单色绿屏** —— 那些标记在屏上全是噪声（实测正文里有 46 处 `**`）。
 * 在这一层洗掉，界面与 TTS 拿到的就都是干净文本（只删标记，不改内容）。
 *
 * @param {{ year: number, month: number, day: number, hour: number, gender: string }} birth
 * @returns {Promise<{ status: string, key?: string, dimensions?: Array<{key: string, label: string, text: string}>, message?: string, citationMode?: string, citationModeLabel?: string }>}
 *   citationModeLabel 是**要在界面上披露**的降级模式说明
 *   （例如「引文已降级（《天纪》原话以「引文略」代替）」）。
 */
export async function requestReading(birth) {
  const res = await postJson('/api/agent/reading', birth, TIMEOUTS.reading);
  if (res && Array.isArray(res.dimensions)) {
    res.dimensions = res.dimensions.map((d) => ({
      ...d,
      text: toPlainText(d && d.text)
    }));
  }
  return res;
}

/**
 * 基于命盘追问。
 *
 * ⚠️ 回答同样在这里洗成纯文本（原因见 `requestReading`）。
 *
 * ⚠️ **瞬时故障重试一次**。
 *
 * 为什么：实测生产域名的 `/api/agent/ask` 响应时间在 **15.8s / 29.6s / 34.2s /
 * 36.5s / 47.6s / 57.5s** 之间大幅波动（模型负载），而且**偶发整次失败**
 * （2026-11-13 渲染提审视频时实测到一次失败，页面只能显示
 * 「这一问暂时没有回答，单击重试。」）。
 * 眼镜上没有键盘、用户只能重按一次镜腿 —— 而录制赛事作品视频时
 * 一次失败就得整段重拍，所以这里替用户**自动重试一次**。
 *
 * ⚠️ **超时不重试**：超时说明后端已经跑了很久、用户也等了很久，
 * 再来一轮只会让等待翻倍（120s → 240s）。超时是「这次真的不行」，
 * 网络抖动与 5xx 才是「再来一次就好」。
 *
 * @param {Object} birth
 * @param {string} question
 * @param {Array<{ question: string, answer: string }>} [turns] 上文
 * @param {Object} [focus] 页内焦点（维度 / 宫位）
 * @returns {Promise<{ answer: string, cited: string[], verification: string, model: string, citationMode?: string, citationModeLabel?: string }>}
 */
export async function requestAsk(birth, question, turns = [], focus = {}) {
  const payload = { ...birth, question, turns, focus };
  let res;
  try {
    res = await postJson('/api/agent/ask', payload, TIMEOUTS.ask);
  } catch (err) {
    if (err && err.isTimeout) throw err;
    console.info(
      '[ziwei-agent] 追问失败，重试一次：',
      err && err.message ? err.message : String(err)
    );
    /** 稍等一下再试：后端刚失败过一次，立刻重试大概率还占着同一个坏槽位 */
    await new Promise((r) => setTimeout(r, 1500));
    res = await postJson('/api/agent/ask', payload, TIMEOUTS.ask);
  }
  if (res && typeof res.answer === 'string') {
    res.answer = toPlainText(res.answer);
  }
  return res;
}
