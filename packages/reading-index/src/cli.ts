#!/usr/bin/env node
/**
 * 索引构建 CLI。
 *
 *   npm run index:build -- --years 1990,2000,2020
 *   npm run index:build -- --all
 */

import { buildIndex, listRawYears, resolveDataDir } from './index';

function parseArgs(argv: string[]) {
  const out: { years?: number[]; all: boolean; dataDir?: string } = { all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--years') {
      out.years = (argv[++i] ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
    } else if (a === '--all') {
      out.all = true;
    } else if (a === '--data-dir') {
      out.dataDir = argv[++i];
    } else if (a === '-h' || a === '--help') {
      console.log(
        '用法: tsx packages/reading-index/src/cli.ts [--years 1990,2000,2020 | --all] [--data-dir DIR]',
      );
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = resolveDataDir(args.dataDir);
  const available = listRawYears(dataDir);

  console.log(`数据目录: ${dataDir}`);
  console.log(`已解压年份: ${available.length ? available.join(', ') : '（无）'}`);

  if (!available.length) {
    console.error(
      '\n未找到已解压数据。先运行：\n  scripts/download_data.sh --years 1990,2000,2020 --decompress 1990,2000,2020',
    );
    process.exit(1);
  }

  const years = args.years?.length ? args.years : available;
  const missing = years.filter((y) => !available.includes(y));
  if (missing.length) {
    console.warn(`⚠️  跳过未解压的年份: ${missing.join(', ')}`);
  }
  const targets = years.filter((y) => available.includes(y));
  if (!targets.length) {
    console.error('没有可构建的年份。');
    process.exit(1);
  }

  const t0 = Date.now();
  const indexes = await buildIndex({
    dataDir,
    years: targets,
    onProgress: (year, done, total) => {
      const pct = total ? ((done * 1.0) / total) * 100 : 0;
      process.stdout.write(
        `\r  ${year}: ${done.toLocaleString()} 行 (${pct.toFixed(1)}%)   `,
      );
    },
  });

  console.log('\n');
  let total = 0;
  for (const idx of indexes) {
    console.log(`  year-${idx.year}.idx.json  ${idx.count.toLocaleString()} 条`);
    total += idx.count;
  }
  console.log(`\n✅ 完成：${indexes.length} 个年份，共 ${total.toLocaleString()} 条记录，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
