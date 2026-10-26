/**
 * 命令行参数解析与生辰归一化。
 *
 * 输入层职责：
 *  · 接受「时辰序号」或「中文地支」或「钟点」三种写法；
 *  · 钟点经 `resolveChartDate()` 转成「排盘日 + 时辰序号」，
 *    晚子时（23:00–23:59）按**次日**排盘；
 *  · 解析失败时给出人话错误，不抛栈。
 */

import { resolveChartDate } from '@ziwei/chart-engine';
import type { Birth } from '@ziwei/core';
import { BRANCH_NAMES } from './lunar';

/** 参数错误（退出码 2） */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** 已知子命令 */
export type Command = 'chart' | 'read' | 'ask' | 'coverage' | 'help';

const COMMANDS: Command[] = ['chart', 'read', 'ask', 'coverage', 'help'];

/** 取值的参数 */
const VALUE_OPTIONS = [
  'date', 'hour', 'clock', 'gender', 'name', 'dim', 'question', 'citations',
] as const;

/** 布尔开关 */
const BOOL_FLAGS = ['json', 'full', 'no-color', 'help'] as const;

export interface ParsedArgs {
  positionals: string[];
  values: Record<string, string>;
  flags: Set<string>;
}

export function parseArgv(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const flags = new Set<string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      const key = eq >= 0 ? body.slice(0, eq) : body;

      if ((BOOL_FLAGS as readonly string[]).includes(key)) {
        if (eq >= 0) {
          throw new UsageError(`参数 --${key} 不带取值`);
        }
        flags.add(key);
        continue;
      }

      if (!(VALUE_OPTIONS as readonly string[]).includes(key)) {
        throw new UsageError(`未知参数 --${key}`);
      }

      if (eq >= 0) {
        values[key] = body.slice(eq + 1);
        continue;
      }

      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-')) {
        throw new UsageError(`参数 --${key} 缺少取值`);
      }
      values[key] = next;
      i++;
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      if (arg === '-h') {
        flags.add('help');
        continue;
      }
      throw new UsageError(`未知参数 ${arg}`);
    }

    positionals.push(arg);
  }

  return { positionals, values, flags };
}

/** 解析子命令；缺省为 help */
export function resolveCommand(parsed: ParsedArgs): Command {
  const first = parsed.positionals[0];
  if (parsed.flags.has('help') && !first) return 'help';
  if (!first) return 'help';
  if (!COMMANDS.includes(first as Command)) {
    throw new UsageError(`未知子命令「${first}」，可用：${COMMANDS.join(' / ')}`);
  }
  if (parsed.positionals.length > 1) {
    throw new UsageError(
      `多余的参数「${parsed.positionals[1]}」，可用子命令：${COMMANDS.join(' / ')}`,
    );
  }
  return first as Command;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** 解析公历日期，接受 YYYY-MM-DD / YYYY/MM/DD / YYYYMMDD */
export function parseDate(raw: string): DateParts {
  const text = raw.trim();
  const m = /^(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})$/.exec(text);
  if (!m) {
    throw new UsageError(`日期格式应为 YYYY-MM-DD，收到「${raw}」`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new UsageError(`该日期不存在：${year}-${month}-${day}`);
  }
  return { year, month, day };
}

/** 解析钟点，接受 HH:MM / H:MM / HH */
export function parseClock(raw: string): { hour: number; minute: number } {
  const text = raw.trim();
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (!m) {
    throw new UsageError(`钟点格式应为 HH:MM，收到「${raw}」`);
  }
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour < 0 || hour > 23) {
    throw new UsageError(`钟点小时需在 0–23 之间，收到：${hour}`);
  }
  if (minute < 0 || minute > 59) {
    throw new UsageError(`钟点分钟需在 0–59 之间，收到：${minute}`);
  }
  return { hour, minute };
}

/** 解析时辰：既接受序号 0–11，也接受中文地支（子/丑/…/亥，可带「时」后缀） */
export function parseShichen(raw: string): number {
  const text = raw.trim().replace(/[时時]$/, '');
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    if (n < 0 || n > 11) {
      throw new UsageError(
        `时辰序号需在 0–11 之间（子=0 … 亥=11），收到：${n}。` +
          `若想用钟点，请改用 --clock HH:MM。`,
      );
    }
    return n;
  }
  const idx = BRANCH_NAMES.indexOf(text as (typeof BRANCH_NAMES)[number]);
  if (idx >= 0) return idx;
  throw new UsageError(
    `无法识别时辰「${raw}」。可用写法：序号 0–11，或中文 ${BRANCH_NAMES.join('')}。`,
  );
}

/** 解析性别，接受 male/female/m/f/男/女 */
export function parseGender(raw: string): 'male' | 'female' {
  const text = raw.trim().toLowerCase();
  if (text === 'male' || text === 'm' || text === '男') return 'male';
  if (text === 'female' || text === 'f' || text === '女') return 'female';
  throw new UsageError(`性别需为 male 或 female（也可写 男/女、m/f），收到「${raw}」`);
}

/** 钟点 → 排盘日 + 时辰序号的换算说明 */
export interface ClockConversion {
  /** 原始钟点，如 "23:30" */
  clock: string;
  /** 换算出的时辰序号 0–11 */
  hourIndex: number;
  /** 换算出的时辰地支，如 "子" */
  hourBranch: string;
  /** 用户输入的日期 */
  inputDate: string;
  /** 实际排盘日（晚子时为次日） */
  chartDate: string;
  /** 是否发生了晚子时跨日 */
  lateZi: boolean;
}

export interface ResolvedBirth {
  birth: Birth;
  conversion?: ClockConversion;
}

export interface BirthOptions {
  date?: string;
  hour?: string;
  clock?: string;
  gender?: string;
  name?: string;
}

/**
 * 把命令行输入归一化成 `Birth`。
 *
 * `--hour` 与 `--clock` 二选一。给了 `--clock` 就走 `resolveChartDate()`，
 * 晚子时自动改排次日，并带回换算说明供展示层打印。
 */
export function resolveBirth(opts: BirthOptions): ResolvedBirth {
  if (!opts.date) {
    throw new UsageError('缺少必填参数 --date（公历出生日期，如 1990-01-01）');
  }
  if (!opts.gender) {
    throw new UsageError('缺少必填参数 --gender（male / female）');
  }
  if (opts.hour && opts.clock) {
    throw new UsageError('--hour 与 --clock 只能二选一（一个是时辰序号，一个是钟点）');
  }
  if (!opts.hour && !opts.clock) {
    throw new UsageError('请提供 --hour <0-11 或 子丑寅卯…> 或 --clock <HH:MM>');
  }

  const date = parseDate(opts.date);
  const gender = parseGender(opts.gender);
  const name = opts.name?.trim() || undefined;

  if (opts.clock) {
    const { hour, minute } = parseClock(opts.clock);
    const resolved = resolveChartDate(date.year, date.month, date.day, hour, minute);
    const clockText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const chartDate = `${resolved.year}-${String(resolved.month).padStart(2, '0')}-${String(resolved.day).padStart(2, '0')}`;
    const inputDate = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
    return {
      birth: {
        year: resolved.year,
        month: resolved.month,
        day: resolved.day,
        hour: resolved.hour,
        gender,
        ...(name ? { name } : {}),
      },
      conversion: {
        clock: clockText,
        hourIndex: resolved.hour,
        hourBranch: BRANCH_NAMES[resolved.hour] ?? '?',
        inputDate,
        chartDate,
        lateZi: chartDate !== inputDate,
      },
    };
  }

  const hour = parseShichen(opts.hour!);
  return {
    birth: {
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      gender,
      ...(name ? { name } : {}),
    },
  };
}
