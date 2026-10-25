/**
 * 数据集可用性探测。
 *
 * CI 里没有 56GB 数据集，所以所有依赖数据的用例必须能**明确 skip**，
 * 而不是 fail —— 否则 CI 永远是红的，没人会看。
 *
 * 但反过来：数据缺失**不允许**让纯引擎用例（金标准 / 确定性 / 边界）也一起跳过。
 * 所以「数据可用性」在这里集中判断，各测试文件自己决定要不要 skip。
 */

import fs from 'node:fs';
import path from 'node:path';

import { ReadingIndex } from '@ziwei/reading-index';

export interface DataStatus {
  /** 数据集是否可用（至少建了一个年份的索引） */
  available: boolean;
  /** 不可用时的原因（写进 skip 说明） */
  reason: string;
  /** 已建索引的年份 */
  indexedYears: number[];
  /** 数据目录 */
  dataDir: string;
}

/**
 * 探测数据集状态。
 *
 * 注意：`new ReadingIndex()` 在没有数据时**不会**抛错（它只是解析出一个路径），
 * 所以必须靠 indexedYears() 是否为空来判断。
 */
export function probeData(index?: ReadingIndex): DataStatus {
  const idx = index ?? new ReadingIndex();
  const indexedYears = idx.indexedYears();
  const dataDir = idx.dataDir;

  if (indexedYears.length > 0) {
    return { available: true, reason: '', indexedYears, dataDir };
  }

  const rawDir = path.join(dataDir, 'raw');
  const indexDir = path.join(dataDir, 'index');
  const hasRaw = fs.existsSync(rawDir);
  const hasIndex = fs.existsSync(indexDir);

  let reason: string;
  if (!hasRaw && !hasIndex) {
    reason =
      `数据集目录不存在（${dataDir}）—— 请先下载数据集并运行 npm run index:build` +
      `（见 README「下载数据」一节）`;
  } else if (!hasIndex) {
    reason = `数据集已下载但还没建索引（${indexDir} 不存在）—— 请运行 npm run index:build`;
  } else {
    reason = `索引目录存在但没有年份分片（${indexDir}）—— 请运行 npm run index:build`;
  }

  return { available: false, reason, indexedYears, dataDir };
}
