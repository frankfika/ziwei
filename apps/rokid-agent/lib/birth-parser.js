/**
 * 语音录入生辰 —— 从一句话里解析出排盘所需的四个参数。
 *
 * 为什么要有这个：
 *  · 眼镜上没有键盘，**打字录入生辰是不成立的交互**；
 *  · 语音是眼镜上唯一自然的主输入，所以「说出你的生辰」必须是能用的。
 *
 * 这个解析器是**纯函数**，能被单测钉死 —— 它一旦解析错，
 * 排出来的盘就全错，而且是用户看不见原因的那种错。
 *
 * 支持的说法（覆盖真实口语）：
 *   「1990年1月1日 子时 男」
 *   「我是一九九零年一月一日生的，晚上十一点，女」
 *   「1990-01-01 23点 male」
 *   「2000年2月29号 丑时」
 *   「1990年1月1日 下午三点」
 *
 * 时辰口径与引擎严格一致（packages/chart-engine 的 shichenFromClock）：
 *   子=0(23:00–00:59) 丑=1 寅=2 卯=3 辰=4 巳=5 午=6 未=7 申=8 酉=9 戌=10 亥=11
 * 23 点是**晚子时**，按**次日**排盘（引擎 resolveChartDate 同口径）。
 */

/** 辰/时 → 时辰序号 0–11 */
export const HOUR_BY_NAME = {
  子: 0, 丑: 1, 寅: 2, 卯: 3, 辰: 4, 巳: 5,
  午: 6, 未: 7, 申: 8, 酉: 9, 戌: 10, 亥: 11,
};

/** 时辰中文名 → 时辰序号 */
export const HOUR_BY_LABEL = {
  子时: 0, 丑时: 1, 寅时: 2, 卯时: 3, 辰时: 4, 巳时: 5,
  午时: 6, 未时: 7, 申时: 8, 酉时: 9, 戌时: 10, 亥时: 11,
};

/**
 * 口语时段 → 时辰序号（**没有更精确的钟点时**的兜底落点）。
 *
 * 取的是该时段的中段：早上(卯 05–06:59)、上午(巳 09–10:59)、
 * 中午(午 11–12:59)、下午(申 15–16:59)、傍晚(酉 17–18:59)、晚上(戌 19–20:59)。
 */
export const HOUR_BY_PERIOD = {
  凌晨: 1, 早上: 3, 早晨: 3, 清晨: 3, 上午: 5, 中午: 6, 下午: 8, 傍晚: 9, 晚上: 10, 夜里: 10, 深夜: 10,
};

/**
 * 口语时段 → 是否下午/晚上。
 *
 * 用来还原「晚上十一点」= 23 点这类组合。只知道时段、不知道钟点时，
 * 落回 HOUR_BY_PERIOD 的时辰序号；两处口径不要混用。
 */
export const PERIOD_IS_PM = {
  凌晨: false, 早上: false, 早晨: false, 清晨: false, 上午: false,
  中午: false, 下午: true, 傍晚: true, 晚上: true, 夜里: true, 深夜: true,
};

/** 中文数字 → 阿拉伯数字（覆盖 0–99） */
const CN_DIGITS = {
  零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 两: 2, 贰: 2, 三: 3, 叁: 3, 四: 4, 肆: 4,
  五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9,
  十: 10, 拾: 10,
};

/**
 * 中文数字转阿拉伯数字（0–99）。
 *
 * 「十」=10、「十一」=11、「二十三」=23、「零」=0。
 * 非法输入返回 null。
 *
 * ⚠️ **只支持 0–99**：四位年份（「一九九零」）走的是**按位读**，
 * 不是这个「十进制位值」体系，必须用 cnYearToNumber 单独解析。
 *
 * @param {string} text
 * @returns {number | null}
 */
export function cnToNumber(text) {
  if (!text) return null;
  const s = String(text).trim();
  if (/^\d+$/.test(s)) return Number(s);

  if (s.length === 1) {
    const v = CN_DIGITS[s];
    return typeof v === 'number' ? v : null;
  }

  // 十X
  if (s[0] === '十' || s[0] === '拾') {
    const rest = s.slice(1);
    if (!rest) return 10;
    const v = CN_DIGITS[rest];
    return typeof v === 'number' ? 10 + v : null;
  }

  // X十 或 X十Y
  const m = s.match(/^([零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖])[十拾]([零〇一壹二两贰三叁四肆五伍六陆七柒八捌九玖])?$/);
  if (m) {
    const tens = CN_DIGITS[m[1]];
    const ones = m[2] === undefined ? 0 : CN_DIGITS[m[2]];
    return tens * 10 + ones;
  }

  return null;
}

/**
 * 四位中文年份（**按位读**）：「一九九零」= 1990、「二零零八」= 2008。
 *
 * 为什么不能走 cnToNumber：那个是「十进制位值」体系（十=10、二十三=23），
 * 覆盖不了 0–99 之外的值；年份在口语里是**逐位念**的，体系不同。
 *
 * @param {string} text
 * @returns {number | null}
 */
export function cnYearToNumber(text) {
  if (!text) return null;
  const s = String(text).trim();
  if (/^\d{4}$/.test(s)) return Number(s);
  if (s.length !== 4) return null;
  let out = 0;
  for (const ch of s) {
    const v = CN_DIGITS[ch];
    if (typeof v !== 'number' || v > 9) return null;
    out = out * 10 + v;
  }
  return out;
}

/**
 * 从中文数字串里取一个落在 [min, max] 的值，**越界就往短里退**。
 *
 * 为什么必须回退：「二月二十九日」里的月，贪心匹配到「二十」= 20（越界），
 * 退到「二」= 2 才是对的。贪心 + 越界回退，是这类口语日期唯一稳妥的读法。
 *
 * @param {string} text
 * @param {number} min
 * @param {number} max
 * @returns {number | null}
 */
function cnValueInRange(text, min, max) {
  const s = String(text ?? '').trim();
  for (let len = Math.min(3, s.length); len >= 1; len--) {
    const v = cnToNumber(s.slice(0, len));
    if (v !== null && v >= min && v <= max) return v;
  }
  return null;
}

/**
 * 从钟点（0–23）推时辰序号。
 *
 * 口径与引擎一致：子时横跨 23:00–00:59，两段都归序号 0；
 * 23 点是**晚子时**，按次日排盘（由 resolveChartDate 处理 +1 天）。
 *
 * @param {number} clockHour 0–23
 * @returns {number} 时辰序号 0–11
 */
export function hourFromClock(clockHour) {
  const h = Number(clockHour);
  if (!Number.isInteger(h) || h < 0 || h > 23) return 0;
  if (h === 23) return 0;
  if (h === 0) return 0;
  return Math.floor((h - 1) / 2) + 1;
}

/**
 * 从一句话里抽出钟点（0–23）。
 *
 * 认三种写法：
 *   23:30 / 23：30  → 23
 *   23点 / 23 点      → 23
 *   十一点 / 二十三点 → 11 / 23（中文数字钟点，口语里非常常见）
 *
 * @param {string} s 已归一化的文本
 * @returns {number | null}
 */
function extractClockHour(s) {
  // 1) 冒号写法：23:30
  const colon = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (colon) {
    const h = Number(colon[1]);
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
  }

  // 2) 阿拉伯数字 + 「点」：23点
  const arabic = s.match(/(\d{1,2})\s*点/);
  if (arabic) {
    const h = Number(arabic[1]);
    if (Number.isInteger(h) && h >= 0 && h <= 23) return h;
  }

  // 3) 中文数字 + 「点」：十一点
  const cn = s.match(/([零〇一二三四五六七八九十]{1,3})\s*点/);
  if (cn) {
    const h = cnToNumber(cn[1]);
    if (h !== null && h >= 0 && h <= 23) return h;
  }

  return null;
}

/**
 * 口语时段 + 钟点 → 真实钟点。
 *
 * 「晚上十一点」= 23 点，不是 11 点；
 * 「中午一点」= 13 点，不是 1 点；
 * 「凌晨十二点」= 0 点。
 *
 * @param {number} clock
 * @param {string | null} period
 * @returns {number}
 */
function resolveClockWithPeriod(clock, period) {
  if (!period) return clock;
  if (period === '中午') {
    if (clock === 12) return 12; // 中午十二点 = 12:00
    if (clock >= 1 && clock <= 6) return clock + 12; // 中午一点 = 13:00
    return clock;
  }
  if (PERIOD_IS_PM[period] && clock >= 1 && clock <= 11) return clock + 12;
  if (period === '凌晨' && clock === 12) return 0;
  return clock;
}

/**
 * 从一句话里解析出生辰。
 *
 * @param {string} text 语音转写文本
 * @returns {{ year: number, month: number, day: number, hour: number, gender: 'male'|'female', name: string } | null}
 */
export function parseBirthFromSpeech(text) {
  if (!text || typeof text !== 'string') return null;
  const raw = text.trim();
  if (!raw) return null;

  /**
   * 归一化：全角数字 → 半角，全角冒号 → 半角，中文标点 → 空格。
   *
   * ⚠️ **关键**：这里**不能**把「年/月/日/号/点/时」替换成分隔符。
   * 后面的中文数字日期正则、「X时」「X点」识别要的正是这些字，
   * 提前吃掉会让它们**永远匹配不上** —— 这是曾经踩过的真 bug，
   * 表现是「所有带中文标记的生辰一律解析失败」。
   */
  let s = raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/[，,、。．；;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // ── 年月日 ─────────────────────────────────────────────
  let year = null;
  let month = null;
  let day = null;

  // ① 数字日期（分隔符明确，最可靠）：1990-01-01 / 1990年1月1日 / 1990/1/1
  const numeric = s.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (numeric) {
    year = Number(numeric[1]);
    month = Number(numeric[2]);
    day = Number(numeric[3]);
  } else {
    // ② 无分隔符：19900101
    const compact = s.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
    if (compact) {
      year = Number(compact[1]);
      month = Number(compact[2]);
      day = Number(compact[3]);
    } else {
      // ③ 纯中文 / 混合：一九九零年一月一日
      //    年份先取并**把年份片段抹掉**，否则月/日的正则会误吃年份数字
      //    （「1990年1月1日」里若不抹，月会读到 90）。
      const yNum = s.match(/(\d{4})\s*[-/.年]/);
      const yCn = s.match(/([零〇一二三四五六七八九]{4})\s*年/);
      if (yNum) {
        year = Number(yNum[1]);
        s = s.replace(yNum[0], ' ');
      } else if (yCn) {
        year = cnYearToNumber(yCn[1]);
        s = s.replace(yCn[0], ' ');
      }

      const mNum = s.match(/(\d{1,2})\s*[-/.月]/);
      const mCn = s.match(/([零〇一二三四五六七八九十]{1,3})\s*月/);
      if (mNum) month = Number(mNum[1]);
      else if (mCn) month = cnValueInRange(mCn[1], 1, 12);

      const dNum = s.match(/(\d{1,2})\s*[日号]/);
      const dCn = s.match(/([零〇一二三四五六七八九十]{1,3})\s*[日号]/);
      if (dNum) day = Number(dNum[1]);
      else if (dCn) day = cnValueInRange(dCn[1], 1, 31);
    }
  }

  if (!year || !month || !day) return null;
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // ── 时辰 ───────────────────────────────────────────────
  /** 时辰序号 0–11 */
  let hour = null;
  /** 钟点 0–23（仅当用户说了具体钟点时有值） */
  let clockHour = null;

  // 1) 明确的时辰名（子时…亥时）—— 最明确，优先级最高
  const labelMatch = s.match(/([子丑寅卯辰巳午未申酉戌亥])\s*时/);
  if (labelMatch) {
    hour = HOUR_BY_NAME[labelMatch[1]];
  }

  // 2) 口语时段（先记下来，可能与钟点组合）
  let period = null;
  for (const word of Object.keys(HOUR_BY_PERIOD)) {
    if (s.includes(word)) {
      period = word;
      break;
    }
  }

  // 3) 钟点（11点 / 23:30 / 十一点）
  if (hour === null) {
    const rawClock = extractClockHour(s);
    if (rawClock !== null) {
      clockHour = resolveClockWithPeriod(rawClock, period);
      hour = hourFromClock(clockHour);
    }
  }

  // 4) 只有时段，没有钟点 → 落到该时段的中段
  if (hour === null && period !== null) {
    hour = HOUR_BY_PERIOD[period];
  }

  if (hour === null || hour === undefined) return null;

  // ── 性别 ───────────────────────────────────────────────
  /** @type {'male' | 'female' | null} */
  let gender = null;
  const lower = s.toLowerCase();
  // ⚠️ 顺序要紧：**先判 female**，因为 'female' 里含有 'male'。
  if (/女|姑娘|女生|她/.test(s) || lower.includes('female')) gender = 'female';
  else if (/男|小伙|男生|他/.test(s) || lower.includes('male')) gender = 'male';
  if (!gender) return null;

  // ── 晚子时：日期 +1（与引擎 resolveChartDate 同口径）──
  let y = year;
  let m = month;
  let d = day;
  // 23 点（晚子时）按次日排盘；00 点（早子时）不挪。
  if (clockHour === 23) {
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }

  return { year: y, month: m, day: d, hour, gender, name: '' };
}
