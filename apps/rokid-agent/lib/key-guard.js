/**
 * 镜腿按键去抖。
 *
 * 真机风险（PROPOSAL 10.2 #7 / #13）：GlobalHook 在镜腿滑动时可能把同一次
 * 触摸重复上报成按键，keyUp 本身也不保证只触发一次。四向键是眼镜上唯一的
 * 选择通道，一次误报就是一次选错宫 / 错切层，所以同 code 在窗口内重复到达
 * 一律丢弃；不同 code 不受影响，连按两次的真实操作（≥200ms）也照常通过。
 *
 * 纯函数 + 显式状态，便于在 node 里单测，不依赖 AIUI 运行时。
 */

/** 同一按键 code 的重复上报窗口（毫秒） */
export const KEY_REPEAT_WINDOW_MS = 150;

/**
 * @param {{ lastCode: string|null, lastTs: number }} guard 跨调用保留的状态
 * @param {string} code 本次按键 code
 * @param {number} now 本次到达时间（Date.now()）
 * @param {number} [windowMs]
 * @returns {boolean} true = 接受这次按键；false = 判定为重复上报，丢弃
 */
export function shouldAcceptKey(guard, code, now, windowMs = KEY_REPEAT_WINDOW_MS) {
    if (!code) return false;
    if (guard.lastCode === code && now - guard.lastTs < windowMs) {
        return false;
    }
    guard.lastCode = code;
    guard.lastTs = now;
    return true;
}
