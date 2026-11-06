/**
 * 本机命盘库 —— 只存在眼镜本机，不上传。
 *
 * 与 Web 端口径一致：命盘库与对话都只存 localStorage。
 * 眼镜上没有「账号」概念，也不该有；用户脱下来，眼镜还给他，数据就还给他。
 */

/** localStorage 键名 */
export const PROFILES_KEY = 'ziwei.agent.profiles';
/** 最多存多少张盘（与 Web 端一致） */
export const MAX_PROFILES = 20;

/**
 * 安全读 localStorage。
 *
 * @param {string} key
 * @returns {string | null}
 */
function readRaw(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

/**
 * 安全写 localStorage。
 *
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
function writeRaw(key, value) {
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
