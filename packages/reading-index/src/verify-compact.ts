/**
 * 压缩数据一致性抽验：对比 compact 查询结果与 raw 原文。
 *
 *   tsx packages/reading-index/src/verify-compact.ts --year 2000 [--full]
 *   --full 校验全年每条；默认抽 200 条。
 */
import fs from 'node:fs';
import path from 'node:path';
import { ReadingIndex } from './query';

const args = process.argv.slice(2);
const yearIdx = args.indexOf('--year');
const year = yearIdx >= 0 ? Number(args[yearIdx + 1]) : NaN;
if (!Number.isFinite(year)) {
  console.error('用法: tsx verify-compact.ts --year 2000 [--full]');
  process.exit(1);
}
const full = args.includes('--full');

const idx = JSON.parse(
  fs.readFileSync(path.resolve('data', 'index', `year-${year}.idx.json`), 'utf8'),
) as { records: Record<string, [number, number]>; compact?: { records: Record<string, [number, number]> } };
if (!idx.compact) {
  console.error(`year-${year} 尚未压缩`);
  process.exit(1);
}

const keys = Object.keys(idx.records);
const sample = full ? keys : keys.filter((_, i) => i % Math.ceil(keys.length / 200) === 0);
const ri = new ReadingIndex();
const rawFd = fs.openSync(path.resolve('data', 'raw', `year-${year}.jsonl`), 'r');

let bad = 0;
for (const k of sample) {
  const r = ri.getByKey(k);
  if (!r.found) {
    console.error(`MISS compact: ${k}`);
    bad++;
    continue;
  }
  const [o, l] = idx.records[k];
  const buf = Buffer.alloc(l);
  fs.readSync(rawFd, buf, 0, l, o);
  const raw = JSON.parse(buf.toString('utf8').trim());
  if (JSON.stringify(r.record) !== JSON.stringify(raw)) {
    console.error(`DIFF: ${k}`);
    bad++;
  }
}
fs.closeSync(rawFd);
ri.close();
console.log(bad === 0 ? `OK：${sample.length} 条全部一致` : `失败：${bad}/${sample.length} 条不一致`);
process.exit(bad === 0 ? 0 : 1);
