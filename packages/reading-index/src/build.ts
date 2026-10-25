/**
 * 索引构建：把解压后的 JSONL 扫描成「key → 字节偏移」索引。
 *
 * 设计要点：
 *  · **不复制正文**。56.6GB 的解读文本留在 .jsonl 里，索引只存偏移+长度，
 *    查询时 seek 到那一行读出来。磁盘占用是原文的 1/N，查询是 O(1)。
 *  · 增量友好。某年数据到货就单独 build 那一年，不影响其它年份。
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { YearIndex } from './types';

export interface BuildOptions {
  /** data 根目录（含 raw/ 与 index/） */
  dataDir: string;
  /** 要构建的年份；不传则构建 raw/ 下所有年份 */
  years?: number[];
  /** 进度回调 */
  onProgress?: (year: number, done: number, total: number) => void;
}

/** 列出 raw/ 下已解压的年份 */
export function listRawYears(dataDir: string): number[] {
  const rawDir = path.join(dataDir, 'raw');
  if (!fs.existsSync(rawDir)) return [];
  return fs
    .readdirSync(rawDir)
    .map((f) => /^year-(\d{4})\.jsonl$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

/**
 * 扫描单个年份文件生成索引。
 * 只读每行的 key（`k` 字段）来定位，其余内容不解析 —— 快且省内存。
 */
export async function buildYearIndex(
  dataDir: string,
  year: number,
  onProgress?: (year: number, done: number, total: number) => void,
): Promise<YearIndex> {
  const sourceAbs = path.join(dataDir, 'raw', `year-${year}.jsonl`);
  if (!fs.existsSync(sourceAbs)) {
    throw new Error(`源文件不存在：${sourceAbs}`);
  }

  const records: Record<string, [number, number]> = {};
  const stat = fs.statSync(sourceAbs);
  let byteOffset = 0;
  let lineNo = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(sourceAbs, { encoding: 'utf8', highWaterMark: 1 << 22 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // +1 = 行尾 \n
    if (line.length > 0) {
      // 只取 key，避免 JSON.parse 整个 700MB 文件
      const km = /"k"\s*:\s*"([^"]+)"/.exec(line);
      if (km) {
        records[km[1]] = [byteOffset, lineBytes];
      }
    }
    byteOffset += lineBytes;
    lineNo += 1;
    if (onProgress && lineNo % 2000 === 0) {
      onProgress(year, lineNo, stat.size);
    }
  }

  const index: YearIndex = {
    year,
    source: path.join('raw', `year-${year}.jsonl`),
    count: Object.keys(records).length,
    records,
  };

  const idxDir = path.join(dataDir, 'index');
  fs.mkdirSync(idxDir, { recursive: true });
  const outPath = path.join(idxDir, `year-${year}.idx.json`);
  fs.writeFileSync(outPath, JSON.stringify(index));
  return index;
}

/** 构建指定年份（或全部）索引 */
export async function buildIndex(opts: BuildOptions): Promise<YearIndex[]> {
  const { dataDir, years, onProgress } = opts;
  const target = years?.length ? [...years].sort((a, b) => a - b) : listRawYears(dataDir);
  if (!target.length) {
    throw new Error(
      `未找到已解压的数据。请先运行 scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020`,
    );
  }
  const out: YearIndex[] = [];
  for (const y of target) {
    const idx = await buildYearIndex(dataDir, y, onProgress);
    out.push(idx);
  }
  return out;
}
