/**
 * 排盘来源选择 —— **端侧优先，服务端兜底**。
 *
 * 这是整个智能体「眼镜原生性」的支点：
 *  · 端侧跑 chart-engine：零网络延迟、断网照样出十二宫盘面；
 *  · 端侧产物加载失败（打包缺失 / 运行时不支持动态 import）→ 静默走服务端，
 *    用户看到的盘面**完全一样**（同一份引擎、同一口径）。
 *
 * 关键约束：端侧和服务端跑的是**同一个引擎**，所以两条路径的输出必然一致；
 * tests/rokid_agent.test.ts 会拿 9 份金标准盘把这件事钉死。
 */

/** 端侧引擎模块（构建产物，见 scripts/build-engine.mjs） */
const DEVICE_ENGINE_PATH = '../assets/engine.js';

/**
 * 加载端侧引擎。失败返回 null（**不抛错**）。
 *
 * @returns {Promise<Object | null>}
 */
async function loadDeviceEngine() {
  try {
    const mod = await import(DEVICE_ENGINE_PATH);
    if (mod && typeof mod.chart === 'function') {
      return mod;
    }
    console.info('[ziwei-agent] 端侧引擎已加载但没有 chart 导出，回落服务端排盘');
    return null;
  } catch (err) {
    // 端侧引擎加载失败是**静默**的（界面只显示「服务端计算」），
    // 所以必须在这里打一条日志 —— 否则真机上算错了都看不出原因，
    // 模拟器的日志面板也什么都看不到（2026-11-07 加）。
    console.info(
      '[ziwei-agent] 端侧引擎加载失败，回落服务端排盘：',
      err && err.message ? err.message : String(err),
    );
    return null;
  }
}

/**
 * 排一张盘。
 *
 * @param {{ year: number, month: number, day: number, hour: number, gender: string, name?: string }} birth
 * @param {Object} [deps] 依赖注入（测试用）
 * @param {Function} [deps.requestChart] 服务端排盘函数
 * @returns {Promise<{ chart: Object, source: 'device' | 'server', engine: Object | null }>}
 *   engine 是端侧引擎模块 —— 运限层（大限 / 流年 / 流月）要用它算，
 *   所以必须一起带出来；服务端兜底路径没有引擎，运限层会降级成不可用。
 */
export async function resolveChart(birth, deps = {}) {
  const engine = await loadDeviceEngine();
  if (engine) {
    try {
      const chart = engine.chart(birth);
      if (chart && Array.isArray(chart.palaces) && chart.palaces.length === 12) {
        console.info('[ziwei-agent] 使用端侧引擎排盘');
        return { chart, source: 'device', engine };
      }
      console.info('[ziwei-agent] 端侧排盘结果不完整（宫位数不为 12），回落服务端');
    } catch (err) {
      console.info(
        '[ziwei-agent] 端侧排盘抛错，回落服务端：',
        err && err.message ? err.message : String(err),
      );
    }
  }

  const requestChart = deps.requestChart || (await import('./api.js')).requestChart;
  const chart = await requestChart(birth);
  console.info('[ziwei-agent] 使用服务端排盘');
  return { chart, source: 'server', engine: null };
}

/**
 * 端侧引擎是否可用（用于在界面上标注「端侧计算」）。
 *
 * @returns {Promise<boolean>}
 */
export async function hasDeviceEngine() {
  return (await loadDeviceEngine()) !== null;
}
