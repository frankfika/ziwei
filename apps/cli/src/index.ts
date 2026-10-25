#!/usr/bin/env tsx
/**
 * 紫微助手 CLI —— 入口。
 *
 * 业务逻辑一律走 `@ziwei/core`（排盘 + 解读检索）；
 * 只有「钟点 → 排盘日 + 时辰序号」的输入层换算走 `@ziwei/chart-engine`
 * 的 `resolveChartDate()`（见 docs/ARCHITECTURE.md 第 2.1 节）。
 *
 * 退出码：
 *   0  成功
 *   1  未预期的错误
 *   2  参数错误
 *   3  样本库未覆盖该生辰
 */

import { ZiweiService, DIMENSION_LABELS, READING_DIMENSIONS } from '@ziwei/core';
import type { ReadingDimension } from '@ziwei/core';
import { InvalidBirthError } from '@ziwei/chart-engine';

import {
  parseArgv,
  resolveCommand,
  resolveBirth,
  UsageError,
  type Command,
} from './args';
import { ATTRIBUTION, DISCLAIMER } from './attribution';
import { helpText } from './help';
import {
  renderChart,
  renderCoverage,
  renderFooter,
  renderNotCovered,
  renderReading,
  previewText,
  PREVIEW_CHARS,
} from './render';
import { createTheme, shouldUseColor } from './theme';

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_NOT_COVERED = 3;

/** 维度 key 或中文名 → key */
function resolveDimension(raw: string): ReadingDimension {
  const text = raw.trim();
  if ((READING_DIMENSIONS as readonly string[]).includes(text)) {
    return text as ReadingDimension;
  }
  const byLabel = READING_DIMENSIONS.find((d) => DIMENSION_LABELS[d] === text);
  if (byLabel) return byLabel;
  throw new UsageError(
    `无法识别维度「${raw}」。可用 key：${READING_DIMENSIONS.join(' / ')}` +
      `（也可直接写中文名，如 感情）。`,
  );
}

function write(text: string): void {
  process.stdout.write(text.endsWith('\n') ? text : text + '\n');
}

function writeJson(payload: unknown): void {
  write(JSON.stringify(payload, null, 2));
}

export function run(argv: string[]): number {
  const parsed = parseArgv(argv);
  const command: Command = resolveCommand(parsed);
  const json = parsed.flags.has('json');
  const theme = createTheme(shouldUseColor(parsed.flags.has('no-color')));

  if (command === 'help') {
    if (json) {
      writeJson({
        command: 'help',
        ok: true,
        help: helpText(),
        attribution: ATTRIBUTION,
        disclaimer: DISCLAIMER,
      });
    } else {
      write(helpText());
      write(renderFooter({ theme }).join('\n'));
    }
    return EXIT_OK;
  }

  if (command === 'coverage') {
    const service = new ZiweiService();
    const coverage = service.coverage();
    if (json) {
      writeJson({
        command: 'coverage',
        ok: true,
        coverage,
        attribution: ATTRIBUTION,
        disclaimer: DISCLAIMER,
      });
    } else {
      write(renderCoverage(coverage, { theme }).join('\n'));
      write(renderFooter({ theme }).join('\n'));
    }
    return EXIT_OK;
  }

  // chart / read 需要生辰
  const dim = parsed.values.dim ? resolveDimension(parsed.values.dim) : undefined;
  if (dim && command !== 'read') {
    throw new UsageError('--dim 只适用于 read 子命令');
  }

  const { birth, conversion } = resolveBirth({
    date: parsed.values.date,
    hour: parsed.values.hour,
    clock: parsed.values.clock,
    gender: parsed.values.gender,
    name: parsed.values.name,
  });

  const service = new ZiweiService();

  if (command === 'chart') {
    const chart = service.chart(birth);
    if (json) {
      writeJson({
        command: 'chart',
        ok: true,
        birth,
        ...(conversion ? { conversion } : {}),
        chart,
        attribution: ATTRIBUTION,
        disclaimer: DISCLAIMER,
      });
    } else {
      write(renderChart(chart, { theme, ...(conversion ? { conversion } : {}) }).join('\n'));
      write(renderFooter({ theme }).join('\n'));
    }
    return EXIT_OK;
  }

  // read
  const { chart, reading } = service.full(birth);
  const full = parsed.flags.has('full');

  if (reading.status === 'not-covered') {
    if (json) {
      writeJson({
        command: 'read',
        ok: false,
        status: 'not-covered',
        key: reading.key,
        year: reading.year,
        reason: reading.reason,
        message: reading.message,
        availableYears: reading.availableYears,
        dimensions: [],
        birth,
        ...(conversion ? { conversion } : {}),
        chart,
        attribution: ATTRIBUTION,
        disclaimer: DISCLAIMER,
      });
    } else {
      write(renderChart(chart, { theme, ...(conversion ? { conversion } : {}) }).join('\n'));
      write(renderNotCovered(reading, { theme }).join('\n'));
      write(renderFooter({ theme }).join('\n'));
    }
    return EXIT_NOT_COVERED;
  }

  if (json) {
    const dimensions = reading.dimensions
      .filter((d) => !dim || d.key === dim)
      .map((d) => ({
        key: d.key,
        label: d.label,
        chars: d.chars,
        preview: previewText(d.text),
        text: d.text,
      }));
    writeJson({
      command: 'read',
      ok: true,
      status: 'ok',
      key: reading.key,
      ms: reading.ms,
      totalChars: reading.totalChars,
      selectedDimension: dim ?? null,
      previewChars: PREVIEW_CHARS,
      dimensions,
      birth,
      ...(conversion ? { conversion } : {}),
      chart,
      attribution: ATTRIBUTION,
      disclaimer: DISCLAIMER,
    });
    return EXIT_OK;
  }

  write(renderChart(chart, { theme, ...(conversion ? { conversion } : {}) }).join('\n'));
  write(
    renderReading(reading, { theme, full, ...(dim ? { dim } : {}) }).join('\n'),
  );
  write(renderFooter({ theme }).join('\n'));
  return EXIT_OK;
}

function main(): void {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`参数错误：${err.message}\n`);
      process.stderr.write(`提示：运行 \`ziwei help\` 查看完整用法。\n`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    if (err instanceof InvalidBirthError) {
      process.stderr.write(`生辰无效：${err.message}\n`);
      process.exitCode = EXIT_USAGE;
      return;
    }
    process.stderr.write(
      `运行出错：${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = EXIT_ERROR;
  }
}

main();
