/**
 * 索引完整性。
 *
 * 查的是「数据集这一侧」的健康度：
 *  · 每个已建索引年份记录数 > 8000（一年 = 365/366 天 × 12 时辰 × 2 性别 ≈ 8.7k）
 *  · 索引里的 key 能 seek 回源文件并解析成功（offset/length 没写错、源文件没被换）
 *  · buildKey / parseKey 往返一致
 *  · 13 个解读维度全部存在且非空
 *
 * 依赖数据集；没有数据时整体 skip 并说明原因。
 */

import assert from 'node:assert/strict';

import { READING_DIMENSIONS } from '@ziwei/chart-engine';
import { ReadingIndex, buildKey, parseKey } from '@ziwei/reading-index';

import type { Tester } from './harness';
import { probeData } from './fixtures/data';

/** 每年至少这么多条记录才算索引完整 */
const MIN_RECORDS_PER_YEAR = 8000;

export const suite = async (t: Tester): Promise<void> => {
  const index = new ReadingIndex();
  const data = probeData(index);

  if (!data.available) {
    const reason = `${data.reason}`;
    t.skip('每个已建索引年份记录数 > 8000', reason);
    t.skip('索引 key 能 seek 回源文件并解析成功', reason);
    t.skip('buildKey / parseKey 往返一致', reason);
    t.skip('13 个解读维度全部存在且非空', reason);
    return;
  }

  await t.test('每个已建索引年份记录数 > 8000', () => {
    for (const year of data.indexedYears) {
      const idx = index.getYearIndex(year);
      assert.ok(idx, `${year} 年的索引分片读不出来`);
      assert.ok(
        idx.count > MIN_RECORDS_PER_YEAR,
        `${year} 年只有 ${idx.count} 条记录，要求 > ${MIN_RECORDS_PER_YEAR}`,
      );
      assert.equal(
        idx.count,
        Object.keys(idx.records).length,
        `${year} 年的 count 与 records 条目数不一致`,
      );
    }
  });

  await t.test('索引 key 能 seek 回源文件并解析成功', () => {
    for (const year of data.indexedYears) {
      const idx = index.getYearIndex(year)!;
      const keys = Object.keys(idx.records).sort();
      // 每年抽头/中/尾各若干条，覆盖不同 offset 位置
      const picks = new Set<number>();
      for (let i = 0; i < 40; i += 1) {
        picks.add(Math.floor((i * (keys.length - 1)) / 39));
      }
      for (const i of picks) {
        const key = keys[i];
        const res = index.getByKey(key);
        if (!res.found) {
          assert.fail(`${year} 年的 key ${key} seek 不回来（${res.reason}）`);
        }
        const rec = res.record;
        assert.equal(rec.k, key, `${key}: 记录里的 k 字段与 key 不一致`);
        assert.equal(rec.y, year, `${key}: 记录里的年份不一致`);
        const parsed = parseKey(key);
        assert.ok(parsed, `${key}: key 解析不出来`);
        assert.equal(rec.m, parsed.month, `${key}: 记录里的月份与 key 不一致`);
        assert.equal(rec.d, parsed.day, `${key}: 记录里的日与 key 不一致`);
        assert.equal(rec.h, parsed.hour, `${key}: 记录里的时辰与 key 不一致`);
        assert.equal(rec.g, parsed.gender, `${key}: 记录里的性别与 key 不一致`);
      }
    }
  });

  await t.test('buildKey / parseKey 往返一致', () => {
    const cases = [
      { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const },
      { year: 1990, month: 12, day: 31, hour: 11, gender: 'female' as const },
      { year: 2000, month: 2, day: 29, hour: 6, gender: 'male' as const },
      { year: 2020, month: 9, day: 9, hour: 9, gender: 'female' as const },
      { year: 2026, month: 12, day: 31, hour: 10, gender: 'male' as const },
    ];
    for (const c of cases) {
      const key = buildKey(c);
      assert.deepEqual(parseKey(key), c, `buildKey/parseKey 往返不一致：${key}`);
    }
    assert.equal(buildKey({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' }), '1990-01-01-0-male');
    assert.equal(parseKey('不是 key'), null, '非法 key 应该解析为 null');
  });

  await t.test('13 个解读维度全部存在且非空', () => {
    assert.equal(READING_DIMENSIONS.length, 13, 'READING_DIMENSIONS 不是 13 个');
    for (const year of data.indexedYears) {
      const idx = index.getYearIndex(year)!;
      const keys = Object.keys(idx.records).sort();
      const picks = new Set<number>();
      for (let i = 0; i < 20; i += 1) {
        picks.add(Math.floor((i * (keys.length - 1)) / 19));
      }
      for (const i of picks) {
        const key = keys[i];
        const res = index.getByKey(key);
        assert.ok(res.found, `${key} 读不出来`);
        const rec = res.record;
        for (const dim of READING_DIMENSIONS) {
          const text = rec.c?.[dim];
          assert.equal(
            typeof text,
            'string',
            `${key} 缺少维度「${dim}」的解读文本`,
          );
          assert.ok(
            (text as string).length > 0,
            `${key} 的维度「${dim}」解读文本为空`,
          );
        }
        assert.equal(
          Object.keys(rec.c).length,
          13,
          `${key} 的维度数不是 13（实际 ${Object.keys(rec.c).length}）`,
        );
      }
    }
  });
};

export default suite;
