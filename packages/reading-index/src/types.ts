import type { ReadingDimension } from '@ziwei/chart-engine';

/** 数据集里的一条记录（对应 JSONL 的一行） */
export interface ReadingRecord {
  /** `YYYY-MM-DD-时辰序号-性别` */
  k: string;
  y: number;
  m: number;
  d: number;
  h: number;
  g: 'male' | 'female';
  /** 命宫第一颗主星；命宫无主星时为 null */
  ms: string | null;
  /** 各维字数 */
  t: Record<string, number>;
  /** 13 维解读全文（Markdown） */
  c: Record<string, string>;
}

/** 索引分片（每年一个文件） */
export interface YearIndex {
  year: number;
  /** 相对 data 目录的源文件路径 */
  source: string;
  /** 记录数 */
  count: number;
  /** key → [byteOffset, byteLength] */
  records: Record<string, [number, number]>;
  /**
   * 压缩数据源（存在时查询优先走它）。每条记录是独立 zstd 帧，
   * 用 data/compact/dict 字典压缩，可随机 seek 单条解压。
   */
  compact?: {
    /** 相对 data 目录的路径 */
    source: string;
    /** key → [byteOffset, byteLength]（压缩后） */
    records: Record<string, [number, number]>;
  };
}

/** 查询结果：命中或未命中 */
export type LookupResult =
  | { found: true; record: ReadingRecord }
  | { found: false; reason: 'year-not-indexed' | 'key-not-found'; key: string; year: number };
