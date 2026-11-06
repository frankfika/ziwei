/**
 * 时间层（运限）—— 本命 / 大限 / 流年 / 流月。
 *
 * 为什么要有这一层：
 *  · 盘面本身是**静态**的 —— 排一次就固定，用户没有理由再来第二次；
 *  · 运限是**会变的** —— 大限 10 年一换、流年每年一换、流月每月一换；
 *  · 所以「我现在走到哪一步」这件事每个月都有新答案 —— 这是**天然的复访理由**，
 *    也是作品「使用频率与传播性」这一项能拿分的前提。
 *
 * 口径与 Web 端**完全一致**（见 apps/web/src/app/chart/page.tsx）：
 *  · 大限：当前大限落宫的宫位序号 → chart.daXians[dxIndex]
 *  · 流年：liuNianLayer(chart, 今年)
 *  · 流月：liuYueLayer(chart, 今年, 当前农历月序)
 *
 * 「今年」一律取**公历年**（与 Web 端同一口径）。
 * 边界说明：农历年要到正月初一才换，所以每年 1 月上旬到 2 月初，
 * 公历年的干支会比农历年「快」一步 —— 这是 Web 端已有的同一处取舍，
 * 眼镜端不另立一套，否则两边对不上。
 *
 * 合规口径：这里算的是**时间层的结构性定位**（这一层命宫落在哪、哪几个宫被四化引动），
 * 不是「运势吉凶／转运／开运」—— 与 PROPOSAL.md 第 9.3 节的禁用词表不冲突。
 */

/** 四层，顺序即上下键的循环顺序（从「本命」开始往下走） */
export const TIME_LAYER_KEYS = ['natal', 'daxian', 'liunian', 'liuyue'];

/** 层名（界面上显示用） */
export const TIME_LAYER_NAMES = {
  natal: '本命',
  daxian: '大限',
  liunian: '流年',
  liuyue: '流月',
};

/** 农历月名（流月层标签）—— 与 Web 端 CN_MONTH_NAMES 同口径 */
const CN_MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '冬月', '腊月',
];

/**
 * 循环到下一个 / 上一个时间层。
 *
 * 可用性过滤：某一层算不出来（比如引擎没给出当前大限）时自动跳过，
 * 不能让用户按到一层空白 —— 空白层比「少一层」更糟。
 *
 * @param {string} key 当前层
 * @param {number} delta +1 下一层，-1 上一层
 * @param {(k: string) => boolean} [isAvailable] 该层是否可用
 * @returns {string}
 */
export function nextLayerKey(key, delta, isAvailable) {
  const i = TIME_LAYER_KEYS.indexOf(key);
  const from = i < 0 ? 0 : i;
  const n = TIME_LAYER_KEYS.length;
  if (typeof isAvailable !== 'function') {
    return TIME_LAYER_KEYS[((from + delta) % n + n) % n];
  }
  for (let step = 1; step <= n; step += 1) {
    const idx = (((from + delta * step) % n) + n) % n;
    const candidate = TIME_LAYER_KEYS[idx];
    if (isAvailable(candidate)) return candidate;
  }
  return key;
}

/**
 * 取「今天」的农历信息。
 *
 * ⚠️ 这里**不能**用 chart.lunar —— 那是**出生时**的农历，不是现在的。
 * 流月层要的是「用户当下正处在农历几月」，用出生月的盘去标流月，标签会写错。
 *
 * 实现方式：让端侧引擎排一张「今天」的盘，从它的农历字段里取。
 * 为什么不自己写一套公历→农历换算：
 *  · 端侧不引入第二套历法实现 —— 两套历法迟早会在某个闰月/边界上打架；
 *  · 引擎的农历口径（闰月归属策略）与排盘、数据集检索键**完全同一套**，
 *    这才是「眼镜端和网页端口径一致」该有的样子。
 *
 * @param {Object} engine 端侧引擎模块（需含 chart）
 * @param {Date} [now] 当前时间（测试可注入）
 * @returns {{ year: number, month: number, day: number, isLeapMonth: boolean } | null}
 */
export function currentLunarOf(engine, now) {
  if (!engine || typeof engine.chart !== 'function') return null;
  const d = now || new Date();
  try {
    // 时辰序号取 4（辰时 07:00–08:59）：不跨日，排盘日就是今天。
    const chart = engine.chart({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: 4,
      gender: 'male',
    });
    const lunar = (chart && chart.lunar) || {};
    const month = Number(lunar.lunarMonth);
    return {
      year: Number(lunar.lunarYear) || d.getFullYear(),
      month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : 1,
      day: Number(lunar.lunarDay) || 0,
      isLeapMonth: Boolean(lunar.isLeapMonth),
    };
  } catch (err) {
    return null;
  }
}

/**
 * 星曜在某运限层里是不是四化星，是的话返回带前缀的标记。
 *
 * 前缀是**必须的**：本命四化也是「禄权科忌」，单色绿 HUD 上没有颜色可区分，
 * 不加前缀用户会分不清这是本命的还是这一层的。
 *   大限 → 「限禄」；流年 / 流月 → 「流禄」。
 *
 * 口径与 Web 端 fortuneSiHuaOf 一致（按**星名**匹配，不是按宫）。
 *
 * @param {string} starName
 * @param {Object | null} fortune 运限层
 * @returns {string | null} '限禄' / '流禄' / … / null
 */
export function fortuneSiHuaOf(starName, fortune) {
  if (!fortune || !fortune.siHua || !starName) return null;
  const s = fortune.siHua;
  const prefix = fortune.kind === 'daxian' ? '限' : '流';
  if (s.lu === starName) return `${prefix}禄`;
  if (s.quan === starName) return `${prefix}权`;
  if (s.ke === starName) return `${prefix}科`;
  if (s.ji === starName) return `${prefix}忌`;
  return null;
}

/**
 * 构造一个运限层的展示对象（统一形状，方便上层无差别处理）。
 *
 * @param {Object} opts
 * @returns {Object}
 */
function makeLayer(opts) {
  return {
    key: opts.key,
    kind: opts.kind,
    /** 完整标签，例如「2026 丙午年」「大限 32–41 岁」「农历八月」 */
    label: opts.label,
    /** 该层命宫在本命盘里的宫名，例如「财帛宫」 */
    mingPalaceName: opts.mingPalaceName || '',
    mingBranch: opts.mingBranch,
    palaces: opts.palaces || [],
    siHua: opts.siHua || { lu: '', quan: '', ke: '', ji: '' },
    siHuaPalaces: opts.siHuaPalaces || {},
  };
}

/**
 * 构建四层运限。
 *
 * @param {Object} chart ChartJSON（引擎原始输出）
 * @param {Object | null} engine 端侧引擎模块；需含 daXianLayer / liuNianLayer / liuYueLayer。
 *   为 null 时（端侧引擎加载失败、走了服务端兜底）运限层全部返回 null，
 *   界面降级成只显示本命盘 —— 这是和传感器同款的降级链。
 * @param {Object} [options]
 * @param {Date} [options.now] 当前时间（测试可注入）
 * @returns {{ natal: null, daxian: Object|null, liunian: Object|null, liuyue: Object|null }}
 */
export function buildTimeLayers(chart, engine, options = {}) {
  const now = options.now || new Date();
  const year = now.getFullYear();
  const out = { natal: null, daxian: null, liunian: null, liuyue: null };
  if (!chart || !engine) return out;

  const { daXianLayer, liuNianLayer, liuYueLayer } = engine;
  if (typeof daXianLayer !== 'function' || typeof liuNianLayer !== 'function') {
    return out;
  }

  const palaceNameOf = (branch) => {
    const p = (chart.palaces || []).find((x) => x.branch === branch);
    return p ? p.name : '';
  };

  /* ── 大限：当前大限落宫的宫位序号 → chart.daXians[dxIndex] ── */
  try {
    const dxPalace = (chart.palaces || []).find((p) => p.isCurrentDaXian);
    const dxIndex = dxPalace
      ? (chart.daXians || []).findIndex((d) => d.palaceBranch === dxPalace.branch)
      : -1;
    if (dxIndex >= 0) {
      const dx = daXianLayer(chart, dxIndex);
      if (dx) {
        out.daxian = makeLayer({
          key: 'daxian',
          kind: 'daxian',
          label: `大限 ${dx.label}`,
          mingPalaceName: palaceNameOf(dx.mingBranch),
          mingBranch: dx.mingBranch,
          palaces: dx.palaces,
          siHua: dx.siHua,
          siHuaPalaces: dx.siHuaPalaces,
        });
      }
    }
  } catch (err) {
    out.daxian = null;
  }

  /* ── 流年：今年 ── */
  try {
    const ln = liuNianLayer(chart, year);
    if (ln) {
      out.liunian = makeLayer({
        key: 'liunian',
        kind: 'liunian',
        // 标签口径与 Web 端一致（apps/web/src/app/chart/page.tsx）：干支在前、年份在后
        label: `流年 ${ln.ganzhi} ${ln.year}`,
        mingPalaceName: palaceNameOf(ln.mingBranch),
        mingBranch: ln.mingBranch,
        palaces: ln.palaces,
        siHua: ln.siHua,
        siHuaPalaces: ln.siHuaPalaces,
      });
    }
  } catch (err) {
    out.liunian = null;
  }

  /* ── 流月：当前农历月 ── */
  try {
    if (typeof liuYueLayer === 'function') {
      // 月序取「今天的农历月」，不是出生时的农历月（见 currentLunarOf 的注释）
      const lunar = currentLunarOf(engine, now);
      const month = lunar ? lunar.month : 1;
      const ly = liuYueLayer(chart, year, month);
      if (ly) {
        out.liuyue = makeLayer({
          key: 'liuyue',
          kind: 'liuyue',
          label: `流月 ${CN_MONTH_NAMES[month - 1]} ${String(ly.ganzhi || '').replace('月', '')}`,
          mingPalaceName: palaceNameOf(ly.mingBranch),
          mingBranch: ly.mingBranch,
          palaces: ly.palaces,
          siHua: ly.siHua,
          siHuaPalaces: ly.siHuaPalaces,
        });
      }
    }
  } catch (err) {
    out.liuyue = null;
  }

  return out;
}

/**
 * 从一句话里认出用户在说哪个时间层。
 *
 * 认不出来就返回 null（绝不猜）。两条用路：
 *  · 盘面上切层（上下键的语音替代）；
 *  · 追问时决定聚焦哪一层（用户问「今年怎么样」→ 聚焦流年）。
 *
 * @param {string} text 语音转写文本或用户问题
 * @returns {string | null} layer key
 */
export function detectLayer(text) {
  if (!text || typeof text !== 'string') return null;
  const s = text.trim();
  if (!s) return null;

  // 流月：先判，因为它含「月」这个更常见的字
  if (/本月|这个月|当月|流月/.test(s)) return 'liuyue';
  // 流年
  if (/今年|流年|本年度/.test(s)) return 'liunian';
  // 大限
  if (/大限|这十年|这步大限|当前大限/.test(s)) return 'daxian';
  // 本命
  if (/本命|原始盘|原盘|基本盘/.test(s)) return 'natal';

  return null;
}

/**
 * 追问时的时间层焦点。
 *
 * 用户问「今年运势如何」时，把时间层焦点设成流年 —— 模型那边就会带上
 * 【运限事实】（流年命宫落位、流年四化引动了哪些宫），回答才落在「你现在」，
 * 而不是泛泛而谈本命。
 *
 * 判据：
 *  1. 问题里明说了哪一层（「今年」「大限」）→ 用那一层；
 *  2. 没说但当前盘面停在大限 / 流年 / 流月层 → 跟随当前层（用户正在看的就是他要问的）；
 *  3. 都没有 → 不给焦点（走引擎默认的「当下定位」）。
 *
 * @param {string} question 用户问题
 * @param {string} [layerKey] 当前盘面所在层
 * @returns {{ time?: 'liunian' | 'daxian' } | null}
 */
export function focusFromQuestion(question, layerKey) {
  const said = detectLayer(question);
  if (said === 'liunian') return { time: 'liunian' };
  if (said === 'daxian') return { time: 'daxian' };
  if (layerKey === 'daxian') return { time: 'daxian' };
  if (layerKey === 'liunian') return { time: 'liunian' };
  return null;
}

/**
 * 运限层的四化摘要（一行文字，中宫显示用）。
 *
 * 例：「禄廉贞　权破军　科武曲　忌太阳」
 *
 * @param {Object | null} fortune
 * @returns {string}
 */
export function fortuneSiHuaText(fortune) {
  if (!fortune || !fortune.siHua) return '';
  const s = fortune.siHua;
  const parts = [
    s.lu ? `禄${s.lu}` : '',
    s.quan ? `权${s.quan}` : '',
    s.ke ? `科${s.ke}` : '',
    s.ji ? `忌${s.ji}` : '',
  ].filter(Boolean);
  return parts.join('　');
}
