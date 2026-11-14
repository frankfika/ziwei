/**
 * 本机命盘库 —— 只存在眼镜本机，不上传。
 *
 * 眼镜上没有「账号」概念，也不该有；用户脱下来，眼镜还给他，数据就还给他。
 *
 * ⚠️ 2026-11-14 修（DEVICE-CHECKLIST §3 第 30 条 / E26）：
 *
 *   原来这里读写的是**浏览器 `localStorage`**，而眼镜端（设备侧 runtime）
 *   **根本没有这个 API** —— `typeof localStorage === 'undefined'` ⇒
 *   读写**静默失败**（不报错、不抛异常）⇒ 命盘库在眼镜上永远是空的，
 *   每次启动都回示例盘（换过的盘再也回不去）。
 *
 *   现在改成**双通道**：
 *     · `wx.getStorageSync` / `wx.setStorageSync` —— 眼镜真机（**优先**）
 *     · `localStorage` —— 模拟器 / 电脑浏览器（**兜底**）
 *
 *   ⚠️ `wx` 是**要动态 import 的模块**、不是全局对象（见 lib/api.js 的
 *   `await import('wx')`）；但 `getStorageSync` / `setStorageSync` **本身是同步的**
 *   ⇒ 提前把模块拿到手之后，整条存储链**仍然可以是同步 API**，
 *   不用把 `loadProfiles()` 改成 async（改 async 会把调用方全拖成异步，代价大得多）。
 */

/** 存储键名（两个通道共用同一个 key） */
export const PROFILES_KEY = 'ziwei.agent.profiles';
/** 最多存多少张盘（与 Web 端一致） */
export const MAX_PROFILES = 20;

/**
 * 已就绪的 wx 存储模块。
 *
 * `null` = 不可用（模拟器 / 浏览器 / 眼镜上 wx 没起来）⇒ 走 localStorage 兜底。
 * @type {null | { getStorageSync: Function, setStorageSync: Function }}
 */
let wxStore = null;

/**
 * 预热 wx 存储模块 —— 页面在 onLoad 里 await 一次。
 *
 * ⚠️ 超时保护：眼镜上 `import('wx')` 万一卡住，**首盘不能因此白屏**
 *   （README §5.1 第 11 条：能力缺失永不变白屏）⇒ 超时就放弃 wx、退回 localStorage，
 *   最坏结果是回到示例盘，而不是空白页。
 *
 * @param {number} [timeoutMs] 等待 wx 模块就位的上限
 * @returns {Promise<boolean>} 是否拿到了 wx 存储
 */
export async function initStorage(timeoutMs = 1500) {
    if (wxStore) return true;
    let timer = null;
    try {
        const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), timeoutMs);
        });
        const mod = await Promise.race([import('wx'), timeout]);
        const wx = mod && (mod.default || mod);
        if (
            wx &&
            typeof wx.getStorageSync === 'function' &&
            typeof wx.setStorageSync === 'function'
        ) {
            wxStore = wx;
            return true;
        }
    } catch (err) {
        /* 模拟器 / 浏览器里没有 wx 模块 —— 正常，走 localStorage 兜底 */
    } finally {
        if (timer) clearTimeout(timer);
    }
    return false;
}

/**
 * 只给测试用：清掉缓存的 wx 模块，让下一轮 `initStorage()` 重新探测。
 *
 * @returns {void}
 */
export function resetStorageBackend() {
    wxStore = null;
}

/**
 * 读一个键 —— wx 优先，localStorage 兜底。
 *
 * ⚠️ **wx 可用时它就是唯一通道**，读不到就是读不到，**不回落**去读 localStorage。
 *   否则两个通道都存着东西时会把两份数据**混在一起**（命盘库会凭空多出几张盘）。
 *   兜底的前提是「wx 不可用」，不是「wx 里没这条」。
 *
 * @param {string} key
 * @returns {string | null}
 */
function readRaw(key) {
    if (wxStore) {
        try {
            const value = wxStore.getStorageSync(key);
            return typeof value === 'string' && value ? value : null;
        } catch (err) {
            /* 落到 localStorage 兜底 */
        }
    }
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(key);
    } catch (err) {
        return null;
    }
}

/**
 * 写一个键 —— wx 优先，localStorage 兜底。
 *
 * @param {string} key
 * @param {string} value
 * @returns {boolean} 是否写成功
 */
function writeRaw(key, value) {
    if (wxStore) {
        try {
            wxStore.setStorageSync(key, value);
            return true;
        } catch (err) {
            /* 落到 localStorage 兜底 */
        }
    }
    try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * 读取本机命盘库。
 *
 * @returns {Array<Object>} 每项含 id / year / month / day / hour / gender / name
 */
export function loadProfiles() {
    const raw = readRaw(PROFILES_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (p) =>
                p &&
                Number.isInteger(p.year) &&
                Number.isInteger(p.month) &&
                Number.isInteger(p.day) &&
                Number.isInteger(p.hour) &&
                (p.gender === 'male' || p.gender === 'female'),
        );
    } catch (err) {
        return [];
    }
}

/**
 * 写回本机命盘库。
 *
 * @param {Array<Object>} profiles
 * @returns {boolean}
 */
export function saveProfiles(profiles) {
    const list = Array.isArray(profiles) ? profiles.slice(0, MAX_PROFILES) : [];
    return writeRaw(PROFILES_KEY, JSON.stringify(list));
}

/**
 * 存一张盘（同生辰则覆盖，不重复存）。
 *
 * @param {{ year: number, month: number, day: number, hour: number, gender: string, name?: string }} birth
 * @returns {Array<Object>} 存完之后的完整命盘库
 */
export function upsertProfile(birth) {
    const list = loadProfiles();
    const key = `${birth.year}-${birth.month}-${birth.day}-${birth.hour}-${birth.gender}`;
    const id = key;
    const next = list.filter((p) => p.id !== id);
    next.unshift({ id, ...birth });
    saveProfiles(next);
    return next.slice(0, MAX_PROFILES);
}

/**
 * 取出最近一张盘。
 *
 * @returns {Object | null}
 */
export function latestProfile() {
    const list = loadProfiles();
    return list.length > 0 ? list[0] : null;
}
