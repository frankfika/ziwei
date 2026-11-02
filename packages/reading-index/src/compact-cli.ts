#!/usr/bin/env node
/**
 * 数据压缩 CLI。
 *
 *   npm run data:compact -- --years 2000,2001
 *   npm run data:compact -- --all
 *   npm run data:compact -- --all --jobs 8        # 并行进程数（默认 6）
 *   npm run data:compact -- --all --retrain-dict   # 强制重训字典
 *
 * zstdCompressSync 是同步调用，进程内并发没有并行效果，
 * 所以 --all 按年份拆给多个子进程跑（每进程内部仍串行）。
 * 已压缩的年份自动跳过（幂等），加 --force 才会重做。
 */

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { compactYear, trainDictionary } from './compact';
import { listRawYears, resolveDataDir } from './index';
import fs from 'node:fs';

function parseArgs(argv: string[]) {
  const out: { years?: number[]; all: boolean; jobs: number; retrainDict: boolean; force: boolean; dataDir?: string } = {
    all: false,
    jobs: 6,
    retrainDict: false,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--years') {
      out.years = (argv[++i] ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
    } else if (a === '--all') {
      out.all = true;
    } else if (a === '--jobs') {
      out.jobs = Math.max(1, Number(argv[++i]) || 6);
    } else if (a === '--retrain-dict') {
      out.retrainDict = true;
    } else if (a === '--force') {
      out.force = true;
    } else if (a === '--data-dir') {
      out.dataDir = argv[++i];
    } else if (a === '-h' || a === '--help') {
      console.log(
        '用法: tsx packages/reading-index/src/compact-cli.ts [--years 2000,2001 | --all] [--jobs N] [--retrain-dict] [--force] [--data-dir DIR]',
      );
      process.exit(0);
    }
  }
  return out;
}

function isCompacted(dataDir: string, year: number): boolean {
  const p = path.join(dataDir, 'index', `year-${year}.idx.json`);
  if (!fs.existsSync(p)) return false;
  return !!(JSON.parse(fs.readFileSync(p, 'utf8')) as { compact?: unknown }).compact;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = resolveDataDir(args.dataDir);
  const years =
    args.years ??
    (args.all
      ? listRawYears(dataDir)
      : (() => {
          throw new Error('必须指定 --years 或 --all');
        })());

  // --all 且显式给了 --jobs：按年份拆给子进程，实现真并行。
  // 不带 --jobs 的 --all（npm 脚本默认）也走子进程，jobs 取 CPU 核数。
  if (args.all) {
    const jobs = Math.min(args.jobs, os.cpus().length, years.length);
    const todo = args.force ? years : years.filter((y) => !isCompacted(dataDir, y));
    if (!todo.length) {
      console.log('全部年份已是压缩格式，无需处理（--force 可强制重做）');
      return;
    }
    const per = Math.ceil(todo.length / jobs);
    const script = path.join(__dirname, 'compact-cli.ts');
    const children = Array.from({ length: jobs }, (_, g) => {
      const slice = todo.slice(g * per, (g + 1) * per);
      if (!slice.length) return null;
      return new Promise<number>((resolve) => {
        const p = spawn('npx', ['tsx', script, '--years', slice.join(','), '--data-dir', dataDir], {
          stdio: 'inherit',
        });
        p.on('exit', (code) => resolve(code ?? 1));
      });
    }).filter(Boolean) as Promise<number>[];
    const codes = await Promise.all(children);
    if (codes.some((c) => c !== 0)) process.exit(1);
    return;
  }

  const dictPath = trainDictionary(dataDir, { force: args.retrainDict });
  const dict = fs.readFileSync(dictPath);
  console.log(`字典: ${dictPath} (${(dict.length / 1e6).toFixed(1)} MB)，年份: ${years.length} 个`);

  let rawTotal = 0;
  let compactTotal = 0;
  for (const y of years) {
    if (!args.force && isCompacted(dataDir, y)) {
      console.log(`  ${y}: 已是压缩格式，跳过`);
      continue;
    }
    const r = compactYear(dataDir, y, dict);
    rawTotal += r.rawBytes;
    compactTotal += r.compactBytes;
    console.log(`  ${r.year}: ${(r.rawBytes / 1e6).toFixed(0)} MB → ${(r.compactBytes / 1e6).toFixed(1)} MB`);
  }
  if (compactTotal > 0) {
    console.log(
      `完成：${(rawTotal / 1e9).toFixed(1)} GB → ${(compactTotal / 1e9).toFixed(2)} GB，整体 ${(rawTotal / compactTotal).toFixed(1)}x`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
