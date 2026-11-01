/**
 * 应用服务层 —— Web / CLI / 追问 三端共用的唯一业务入口。
 *
 * 职责边界（很重要，别越界）：
 *  · 排盘：只调 @ziwei/chart-engine 的 chart()。**任何情况下不允许 LLM 代算盘。**
 *  · 解读：只从 @ziwei/reading-index 检索数据集原文。**不允许模型凭空生成断语。**
 *  · 缺键时必须显式返回「样本库未覆盖」，**不允许编造或静默降级**。
 */

import {
  chart,
  chartSummary,
  DIMENSION_LABELS,
  READING_DIMENSIONS,
  liuNianLayer,
  daXianLayer,
  type Birth,
  type ChartJSON,
  type ReadingDimension,
} from '@ziwei/chart-engine';
import { ReadingIndex, buildKey } from '@ziwei/reading-index';

/** 单维解读 */
export interface ReadingDimensionEntry {
  key: ReadingDimension;
  label: string;
  text: string;
  chars: number;
}

/** 解读检索结果 */
export type ReadingLookup =
  | {
      status: 'ok';
      /** 数据集 key */
      key: string;
      /** 命宫第一主星（数据集 ms 字段） */
      ms: string | null;
      /** 13 维解读，按固定顺序 */
      dimensions: ReadingDimensionEntry[];
      /** 总字数 */
      totalChars: number;
    }
  | {
      status: 'not-covered';
      key: string;
      year: number;
      reason: 'year-not-indexed' | 'key-not-found';
      /** 面向用户的中文说明（诚实告知，不编造） */
      message: string;
      /** 当前已建索引的年份 */
      availableYears: number[];
    };

/** 排盘 + 解读 合并结果 */
export interface ZiweiResult {
  birth: Birth;
  chart: ChartJSON;
  reading: ReadingLookup;
}

export interface ZiweiServiceOptions {
  /** 自定义索引（测试用） */
  index?: ReadingIndex;
}

export class ZiweiService {
  readonly index: ReadingIndex;

  constructor(opts: ZiweiServiceOptions = {}) {
    this.index = opts.index ?? new ReadingIndex();
  }

  /** 排盘（只走确定性引擎） */
  chart(birth: Birth): ChartJSON {
    return chart(birth);
  }

  /** 命盘文本摘要（供追问层注入提示词） */
  summary(birth: Birth): string {
    return chartSummary(this.chart(birth));
  }

  /** 检索 13 维解读 */
  reading(birth: Birth): ReadingLookup {
    const key = buildKey({
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      gender: birth.gender,
    });
    const res = this.index.get({
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      gender: birth.gender,
    });

    const availableYears = this.index.indexedYears();

    if (!res.found) {
      const yearSummary = (() => {
        if (!availableYears.length) return '（无）';
        const sorted = [...availableYears].sort((a, b) => a - b);
        if (sorted.length <= 12) return sorted.join(' / ');
        return `${sorted[0]}–${sorted[sorted.length - 1]}（共 ${sorted.length} 年）`;
      })();
      const message =
        res.reason === 'year-not-indexed'
          ? `样本库未覆盖该生辰：${birth.year} 年尚未建索引。` +
            `当前已覆盖 ${yearSummary}。` +
            `请换一个已覆盖年份重试；扩充样本需维护者解压该年数据并重建索引。`
          : `样本库未覆盖该生辰（${key}）。` +
            `该年份 ${birth.year} 已在索引中，但没有这一条 —— ` +
            `通常是该日期在数据集的覆盖范围之外。`;
      return {
        status: 'not-covered',
        key,
        year: birth.year,
        reason: res.reason,
        message,
        availableYears,
      };
    }

    const rec = res.record;
    const dimensions: ReadingDimensionEntry[] = [];
    for (const dim of READING_DIMENSIONS) {
      const text = rec.c?.[dim];
      if (typeof text !== 'string' || text.length === 0) continue;
      dimensions.push({
        key: dim,
        label: DIMENSION_LABELS[dim],
        text,
        chars: rec.t?.[dim] ?? text.length,
      });
    }

    return {
      status: 'ok',
      key,
      ms: rec.ms ?? null,
      dimensions,
      totalChars: dimensions.reduce((s, d) => s + d.chars, 0),
    };
  }

  /** 排盘 + 解读 */
  full(birth: Birth): ZiweiResult {
    return {
      birth,
      chart: this.chart(birth),
      reading: this.reading(birth),
    };
  }

  /** 覆盖情况 */
  coverage() {
    return this.index.coverage();
  }
}

export { chart, chartSummary, DIMENSION_LABELS, READING_DIMENSIONS, liuNianLayer, daXianLayer };
export type { Birth, ChartJSON, ReadingDimension };
