/**
 * 紫微助手 —— 对外公共类型契约。
 *
 * 口径约定（与 v4.0-13d 解读数据集严格一致，见 docs/KEY_SEMANTICS.md）：
 *  · 日期 = 公历「排盘日」
 *  · 时辰 = 时辰序号 0–11（子=0 … 亥=11），**不是** 0–23 点钟
 *  · 不做真太阳时校正（数据集未做；做了会导致检索键错位）
 *  · 性别 = male / female
 */

/** 用户输入的生辰。 */
export interface Birth {
  /** 公历年，如 1990 */
  year: number;
  /** 公历月 1–12 */
  month: number;
  /** 公历日 1–31（须为该月真实存在的日期） */
  day: number;
  /** 时辰序号 0–11：子=0 丑=1 寅=2 卯=3 辰=4 巳=5 午=6 未=7 申=8 酉=9 戌=10 亥=11 */
  hour: number;
  gender: 'male' | 'female';
  /** 称呼，仅展示用 */
  name?: string;
  /**
   * 出生地经度。MVP 流程不用于真太阳时校正，仅记录留痕。
   * 预留给「真太阳时 / 夏令时与检索键对齐」的后续需求。
   */
  longitude?: number;
}

/** 时辰序号 → 地支名 */
export const HOUR_BRANCHES = [
  '子', '丑', '寅', '卯', '辰', '巳',
  '午', '未', '申', '酉', '戌', '亥',
] as const;

/** 时辰序号 → 钟点区间文案（不含真太阳时校正） */
export const HOUR_RANGES = [
  '23:00–00:59', '01:00–02:59', '03:00–04:59', '05:00–06:59',
  '07:00–08:59', '09:00–10:59', '11:00–12:59', '13:00–14:59',
  '15:00–16:59', '17:00–18:59', '19:00–20:59', '21:00–22:59',
] as const;

/** 13 个解读维度（与数据集 `c` 字段的键一一对应） */
export const READING_DIMENSIONS = [
  'overview',   // 命格总览
  'personality',// 性格
  'love',       // 感情
  'career',     // 事业
  'wealth',     // 财运
  'health',     // 健康
  'family',     // 兄弟
  'children',   // 子女
  'move',       // 迁移
  'friends',    // 人际
  'home',       // 田宅
  'spirit',     // 福德
  'parents',    // 父母
] as const;

export type ReadingDimension = (typeof READING_DIMENSIONS)[number];

/** 维度中文名，用于 UI 展示 */
export const DIMENSION_LABELS: Record<ReadingDimension, string> = {
  overview: '命格总览',
  personality: '性格',
  love: '感情',
  career: '事业',
  wealth: '财运',
  health: '健康',
  family: '兄弟',
  children: '子女',
  move: '迁移',
  friends: '人际',
  home: '田宅',
  spirit: '福德',
  parents: '父母',
};

export type StarType = 'major' | 'minor' | 'lucky' | 'sha';

export interface ChartStar {
  name: string;
  type: StarType;
  /** 粗粒度亮度（引擎内部用） */
  brightness?: string;
  /** 紫微斗数标准 8 档亮度（展示层用） */
  brightnessRaw?: string;
  /** 四化：禄 / 权 / 科 / 忌 */
  siHua?: string;
}

export interface ChartPalace {
  /** 地支索引 0–11 */
  branch: number;
  branchName: string;
  /** 天干索引 0–9 */
  stem: number;
  stemName: string;
  /** 宫名：命宫 / 兄弟宫 / 夫妻宫 … */
  name: string;
  isMingGong: boolean;
  isShenGong: boolean;
  isEmpty: boolean;
  /** 空宫借自哪个宫 */
  borrowedFromBranch?: number;
  borrowedFromName?: string;
  borrowedStars?: string[];
  /** 宫干自化 */
  selfSihua?: Array<{ siHua: string; starName: string }>;
  /** 大限年龄段 */
  daXianAge?: [number, number];
  isCurrentDaXian?: boolean;
  /** 对宫地支索引 */
  oppositeBranch?: number;
  stars: ChartStar[];
  /** 按类型分组的星名，UI 直接用 */
  majorStars: string[];
  minorStars: string[];
  luckyStars: string[];
  shaStars: string[];
}

export interface ChartDaXian {
  startAge: number;
  endAge: number;
  palaceBranch: number;
  palaceName: string;
  stemIndex?: number;
  stemName?: string;
  siHua?: {
    lu: string; quan: string; ke: string; ji: string;
  };
}

/**
 * 运限层（对外公共类型）—— 大限与流年共用一套结构。
 *
 * 运限命宫 = 该层命宫落宫的地支；运限十二宫自命宫起按十二宫序逐宫地支减 1（模 12）。
 * 例：流年命宫在午宫，则流年兄弟宫在巳宫、流年夫妻宫在辰宫……（与本命盘宫名排布方向一致）。
 */
export interface ChartFortuneLayer {
  /** 层名：大限 / 流年 */
  kind: 'daxian' | 'liunian';
  /** 年限（如大限 26–35 岁 / 流年 2026） */
  label: string;
  /** 运限命宫地支索引 */
  mingBranch: number;
  /** 运限十二宫：地支索引 → 该层宫名 */
  palaces: Array<{ branch: number; name: string }>;
  /** 该层四化（层干查表） */
  siHua: { lu: string; quan: string; ke: string; ji: string };
  /** 四化四星落宫地支索引；星不在任何宫时省略该键 */
  siHuaPalaces: Record<string, number>;
}

/**
 * 流年运限层（对外公共类型）。
 * 流年命宫 = 流年地支；流年十二宫自命宫起按十二宫序逐宫地支减 1（模 12）。
 */
export interface ChartLiuNian {
  /** 流年公历年 */
  year: number;
  /** 流年干支，如「甲辰」 */
  ganzhi: string;
  /** 流年命宫地支索引（= 流年地支） */
  mingBranch: number;
  /** 流年十二宫 */
  palaces: Array<{ branch: number; name: string }>;
  /** 流年四化（流年天干查表） */
  siHua: { lu: string; quan: string; ke: string; ji: string };
  /** 四化四星落宫地支索引；星不在任何宫时省略该键 */
  siHuaPalaces: Record<string, number>;
}

/**
 * 流月运限层（对外公共类型）。
 * 流月命宫 = 流月月支（正月=寅…十二月=丑）；流月十二宫与流年同构（逐宫地支减 1）。
 */
export interface ChartLiuYue {
  /** 流月所在公历年 */
  year: number;
  /** 实际农历月序 1–12 */
  month: number;
  /** 流月干支，如「丙寅月」 */
  ganzhi: string;
  /** 流月命宫地支索引 */
  mingBranch: number;
  /** 流月十二宫 */
  palaces: Array<{ branch: number; name: string }>;
  /** 流月四化 */
  siHua: { lu: string; quan: string; ke: string; ji: string };
  /** 四化四星落宫地支索引；星不在任何宫时省略该键 */
  siHuaPalaces: Record<string, number>;
}

/**
 * 一张盘的完整结构化结果。
 * 这是排盘引擎 → 展示层 / 追问层 的唯一传递形式。
 */
export interface ChartJSON {
  birth: Birth;
  /** 农历信息（含四柱） */
  lunar: {
    lunarYear: number;
    lunarMonth: number;
    lunarDay: number;
    yearStem: number;
    yearBranch: number;
    isLeapMonth: boolean;
    /** 节气四柱，如 ["壬午","壬子","壬戌","庚戌"] */
    fourPillars?: [string, string, string, string];
    /** 农历口径四柱 */
    fourPillarsLunar?: [string, string, string, string];
  };
  /** 命宫地支索引 */
  mingGongBranch: number;
  /** 身宫地支索引 */
  shenGongBranch: number;
  /** 五行局数值 2–6 */
  wuxingJu: number;
  /** 五行局名，如「水二局」 */
  wuxingJuName: string;
  /** 紫微星所在地支索引 */
  ziweiPos: number;
  /** 命主星 */
  mingZhu?: string;
  /** 身主星 */
  shenZhu?: string;
  /** 阳男 / 阴男 / 阳女 / 阴女 */
  yinYangGender?: string;
  currentAge: number;
  /** 12 宫，按地支 0–11 排序 */
  palaces: ChartPalace[];
  daXians: ChartDaXian[];
}

/** 出生时辰合法性校验的错误类型 */
export class InvalidBirthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBirthError';
  }
}

/**
 * 表单状态（UI 层用）。
 * 源自上游 `components/BirthForm` 的 `BirthFormState`，在此内联以断开与 UI 层的耦合。
 */
export interface BirthFormState {
  name: string;
  year: string;
  month: string;
  day: string;
  clockHour: string;
  clockMinute: string;
  unknownTime: boolean;
  province: string;
  city: string;
  longitude: number;
  gender: 'male' | 'female';
}
