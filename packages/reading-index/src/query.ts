/**
 * 解读索引查询。
 *
 * 只读文件、不写文件 —— 适合在 Web 服务端与 CLI 里安全使用。
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { buildKey, keyOf, parseKey, yearOfKey } from './key';
import type { ChartKeyParts } from './key';
import type { LookupResult, ReadingRecord, YearIndex } from './types';

/**
 * 默认数据目录解析顺序：
 *   1. 显式参数
 *   2. 环境变量 ZIWEI_DATA_DIR
 *   3. 从当前工作目录向上找含 data/index 或 data/raw 的目录
 *   4. 从本文件位置向上找（源码直跑时的兜底）
 *
 * 第 3 步是必须的：Next.js 打包后 import.meta.url 会指向构建产物，
 * 靠它找仓库根会失败。
 */
export function resolveDataDir(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const env = process.env.ZIWEI_DATA_DIR;
  if (env) return path.resolve(env);

  const isDataDir = (p: string) =>
    fs.existsSync(path.join(p, 'index')) ||
    fs.existsSync(path.join(p, 'raw')) ||
    fs.existsSync(path.join(p, 'compact'));

  // 3. 从 cwd 向上找
  // turbopackIgnore: 避免 Next.js 构建时把整个项目纳入 fs tracing
  // （process.cwd() 是动态路径，静态分析会认为要打包整个仓库）
  let dir = path.resolve(/* turbopackIgnore: true */ process.cwd());
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'data');
    if (isDataDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 4. 从本文件位置向上找
  let here = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(here, 'data');
    if (isDataDir(candidate)) return candidate;
    const parent = path.dirname(here);
    if (parent === here) break;
    here = parent;
  }

  // 兜底：仓库根 data/（按 workspace 布局 packages/reading-index/src → ../../..）
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../data',
  );
}

export interface ReadingIndexOptions {
  dataDir?: string;
  /** 索引分片缓存；false 表示每次都重读（测试用） */
  cache?: boolean;
}

export class ReadingIndex {
  readonly dataDir: string;
  private readonly cacheEnabled: boolean;
  private yearIndexes = new Map<number, YearIndex>();
  private fileHandles = new Map<number, number>();
  private compactHandles = new Map<number, number>();
  private dict: Buffer | null | undefined;

  constructor(opts: ReadingIndexOptions = {}) {
    this.dataDir = resolveDataDir(opts.dataDir);
    this.cacheEnabled = opts.cache !== false;
  }

  /** 索引根目录 */
  get indexDir(): string {
    return path.join(this.dataDir, 'index');
  }

  /** 已建索引的年份（升序） */
  indexedYears(): number[] {
    if (!fs.existsSync(this.indexDir)) return [];
    return fs
      .readdirSync(this.indexDir)
      .map((f) => /^year-(\d{4})\.idx\.json$/.exec(f))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);
  }

  /** 某年的索引；未建索引返回 null */
  getYearIndex(year: number): YearIndex | null {
    if (this.cacheEnabled && this.yearIndexes.has(year)) {
      return this.yearIndexes.get(year)!;
    }
    const p = path.join(this.indexDir, `year-${year}.idx.json`);
    if (!fs.existsSync(p)) return null;
    const idx = JSON.parse(fs.readFileSync(p, 'utf8')) as YearIndex;
    if (this.cacheEnabled) this.yearIndexes.set(year, idx);
    return idx;
  }

  private handleFor(year: number): number {
    const cached = this.fileHandles.get(year);
    if (cached !== undefined) return cached;
    const p = path.join(this.dataDir, 'raw', `year-${year}.jsonl`);
    if (!fs.existsSync(p)) {
      throw new Error(`数据源不存在：${p}`);
    }
    const fd = fs.openSync(p, 'r');
    this.fileHandles.set(year, fd);
    return fd;
  }

  /** 压缩字典；没有 dict 文件时退化为无字典解压（兼容未用字典压的数据） */
  private loadDict(): Buffer | null {
    if (this.dict !== undefined) return this.dict;
    const p = path.join(this.dataDir, 'compact', 'dict');
    this.dict = fs.existsSync(p) ? fs.readFileSync(p) : null;
    return this.dict;
  }

  private compactHandleFor(year: number): number {
    const cached = this.compactHandles.get(year);
    if (cached !== undefined) return cached;
    const p = path.join(this.dataDir, 'compact', `year-${year}.bin`);
    if (!fs.existsSync(p)) {
      throw new Error(`压缩数据源不存在：${p}`);
    }
    const fd = fs.openSync(p, 'r');
    this.compactHandles.set(year, fd);
    return fd;
  }

  /** 按 key 取一条解读 */
  getByKey(key: string): LookupResult {
    const year = yearOfKey(key);
    const idx = this.getYearIndex(year);
    if (!idx) return { found: false, reason: 'year-not-indexed', key, year };
    const compactRec = idx.compact?.records[key];
    if (compactRec) {
      const [offset, length] = compactRec;
      const buf = Buffer.alloc(length);
      fs.readSync(this.compactHandleFor(year), buf, 0, length, offset);
      const record = JSON.parse(
        zlib.zstdDecompressSync(buf, { dictionary: this.loadDict() ?? undefined }).toString('utf8'),
      ) as ReadingRecord;
      return { found: true, record };
    }
    const rec = idx.records[key];
    if (!rec) return { found: false, reason: 'key-not-found', key, year };
    const [offset, length] = rec;
    const buf = Buffer.alloc(length);
    fs.readSync(this.handleFor(year), buf, 0, length, offset);
    const record = JSON.parse(buf.toString('utf8').trim()) as ReadingRecord;
    return { found: true, record };
  }

  /** 按生辰取一条解读 */
  get(parts: ChartKeyParts): LookupResult {
    return this.getByKey(buildKey(parts));
  }

  /** 该生辰是否在样本库覆盖范围内 */
  has(parts: ChartKeyParts): boolean {
    const year = parts.year;
    const idx = this.getYearIndex(year);
    if (!idx) return false;
    return buildKey(parts) in idx.records;
  }

  /** 覆盖情况概览 */
  coverage(): {
    years: number[];
    indexedYears: number[];
    totalRecords: number;
    dataDir: string;
  } {
    const years = this.indexedYears();
    let totalRecords = 0;
    for (const y of years) {
      totalRecords += this.getYearIndex(y)?.count ?? 0;
    }
    return {
      years,
      indexedYears: years,
      totalRecords,
      dataDir: this.dataDir,
    };
  }

  /** 释放文件句柄 */
  close(): void {
    for (const fd of [...this.fileHandles.values(), ...this.compactHandles.values()]) {
      try {
        fs.closeSync(fd);
      } catch {
        /* 关闭失败不影响正确性 */
      }
    }
    this.fileHandles.clear();
    this.compactHandles.clear();
  }
}

export { keyOf, buildKey, parseKey, yearOfKey };
export type { ReadingRecord, YearIndex, LookupResult };
