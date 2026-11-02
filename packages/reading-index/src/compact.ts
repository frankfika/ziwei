/**
 * 数据压缩构建器：raw/year-YYYY.jsonl → compact/year-YYYY.bin。
 *
 * 每条记录压缩成独立 zstd 帧（共享 data/compact/dict 字典，~18x），
 * 索引里记录压缩后的偏移，查询端可随机 seek 单条解压。
 * 原始 raw 文件保留不动，查询端优先走 compact、自动回退 raw。
 *
 * 字典训练依赖 zstd CLI（brew install zstd），压缩/解压本身只用 Node 内置 zlib。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const COMPRESS_LEVEL = 19;
const DICT_SAMPLE_PER_YEAR = 25;

export interface CompactYearResult {
  year: number;
  records: number;
  rawBytes: number;
  compactBytes: number;
}

/** 用各年抽样训练共享字典（幂等：已有且非强制则跳过） */
export function trainDictionary(
  dataDir: string,
  opts: { force?: boolean; maxDictBytes?: number } = {},
): string {
  const compactDir = path.join(dataDir, 'compact');
  fs.mkdirSync(compactDir, { recursive: true });
  const dictPath = path.join(compactDir, 'dict');
  if (fs.existsSync(dictPath) && !opts.force) return dictPath;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ziwei-dict-'));
  try {
    let n = 0;
    for (const f of fs.readdirSync(path.join(dataDir, 'index'))) {
      const m = /^year-(\d{4})\.idx\.json$/.exec(f);
      if (!m) continue;
      const idx = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'index', f), 'utf8'),
      ) as { records: Record<string, [number, number]> };
      const fd = fs.openSync(path.join(dataDir, 'raw', `year-${m[1]}.jsonl`), 'r');
      const keys = Object.keys(idx.records).slice(0, DICT_SAMPLE_PER_YEAR);
      for (const k of keys) {
        const [o, l] = idx.records[k];
        const buf = Buffer.alloc(l);
        fs.readSync(fd, buf, 0, l, o);
        fs.writeFileSync(path.join(tmp, `s${n++}.json`), buf);
      }
      fs.closeSync(fd);
    }
    execFileSync(
      'zstd',
      ['--train', ...fs.readdirSync(tmp).map((f) => path.join(tmp, f)), '-o', dictPath, `--maxdict=${opts.maxDictBytes ?? 1_000_000}`],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    return dictPath;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 压缩一年的数据；索引文件原地追加 compact 字段 */
export function compactYear(dataDir: string, year: number, dict: Buffer): CompactYearResult {
  const idxPath = path.join(dataDir, 'index', `year-${year}.idx.json`);
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8')) as {
    records: Record<string, [number, number]>;
    compact?: unknown;
  };
  const rawFd = fs.openSync(path.join(dataDir, 'raw', `year-${year}.jsonl`), 'r');
  const chunks: Buffer[] = [];
  const crecords: Record<string, [number, number]> = {};
  let offset = 0;
  let rawBytes = 0;
  for (const [k, [o, l]] of Object.entries(idx.records)) {
    const buf = Buffer.alloc(l);
    fs.readSync(rawFd, buf, 0, l, o);
    const c = zlib.zstdCompressSync(buf, {
      params: { [zlib.constants.ZSTD_c_compressionLevel]: COMPRESS_LEVEL },
      dictionary: dict,
    });
    chunks.push(c);
    crecords[k] = [offset, c.length];
    offset += c.length;
    rawBytes += l;
  }
  fs.closeSync(rawFd);

  const rel = `compact/year-${year}.bin`;
  fs.writeFileSync(path.join(dataDir, rel), Buffer.concat(chunks));
  idx.compact = { source: rel, records: crecords };
  fs.writeFileSync(idxPath, JSON.stringify(idx));
  return { year, records: Object.keys(crecords).length, rawBytes, compactBytes: offset };
}
