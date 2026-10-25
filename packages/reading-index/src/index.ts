/**
 * @ziwei/reading-index
 *
 * 紫微斗数开源解读数据集 v4.0-13d 的本地索引与检索。
 *
 * 数据集: 674,976 张命盘 × 13 维解读（CC BY 4.0，须署名）
 * 来源:   https://github.com/Renhuai123/ziwei-doushu  作者: 王多鱼AI
 * 详见   ../../ATTRIBUTION.md
 */

export * from './types';
export {
  buildKey,
  parseKey,
  keyOf,
  yearOfKey,
} from './key';
export type { ChartKeyParts, Gender } from './key';
export {
  buildIndex,
  buildYearIndex,
  listRawYears,
} from './build';
export type { BuildOptions } from './build';
export { ReadingIndex, resolveDataDir } from './query';
export type { ReadingIndexOptions } from './query';
