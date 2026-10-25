/**
 * 解读数据集的键（key）口径。
 *
 * 数据集 `k` 字段格式：`YYYY-MM-DD-时辰序号-性别`
 *   例：`1990-01-01-0-male`
 *
 * 其中：
 *  · y/m/d = **排盘日**（公历）。晚子时（23:00–23:59）按次日排盘，
 *            所以 23 点出生的人，其 key 的日期是出生日 +1。
 *  · h     = 时辰序号 0–11（子=0 … 亥=11），**不是** 0–23 点钟
 *  · g     = male / female
 *
 * 该口径由 tests/test_key_alignment.test.ts 用「命宫第一主星（ms）」指纹
 * 对引擎输出做实证校验，不是照抄文档。
 */

import type { Birth } from '@ziwei/chart-engine';

export type Gender = 'male' | 'female';

export interface ChartKeyParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  gender: Gender;
}

/** 组装数据集 key */
export function buildKey(p: ChartKeyParts): string {
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}-${p.hour}-${p.gender}`;
}

/** 解析数据集 key */
export function parseKey(key: string): ChartKeyParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{1,2})-(male|female)$/.exec(key);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    gender: m[5] as Gender,
  };
}

/** 从 Birth 生成 key */
export function keyOf(birth: Birth): string {
  return buildKey({
    year: birth.year,
    month: birth.month,
    day: birth.day,
    hour: birth.hour,
    gender: birth.gender,
  });
}

/** key 对应的数据年份（索引分片依据） */
export function yearOfKey(key: string): number {
  return Number(key.slice(0, 4));
}
