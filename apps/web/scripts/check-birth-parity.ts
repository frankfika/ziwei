/**
 * 一致性校验：apps/web/src/lib/birth.ts 的「输入层镜像」必须与
 * @ziwei/chart-engine 的权威实现逐点一致。
 *
 * 浏览器端只用镜像做表单预览，最终排盘口径由 Server Action 调用引擎计算，
 * 所以两者不允许有偏差。这个脚本穷举全部 1440 个钟点 + 跨月跨年换日。
 *
 * 运行：npx tsx apps/web/scripts/check-birth-parity.ts
 */
import {
  isLateZi as engineLateZi,
  resolveChartDate as engineResolve,
  shichenFromClock as engineShichen,
} from '@ziwei/chart-engine';
import {
  isLateZi as mirrorLateZi,
  resolveChartDate as mirrorResolve,
  shichenFromClock as mirrorShichen,
} from '../src/lib/birth';

let checks = 0;
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// 1) 全部 1440 个钟点 → 时辰序号
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m++) {
    const e = engineShichen(h, m);
    const g = mirrorShichen(h, m);
    if (e !== g) fail(`shichenFromClock(${h}, ${m})：引擎 ${e} ≠ 镜像 ${g}`);
    if (engineLateZi(h) !== mirrorLateZi(h)) fail(`isLateZi(${h}) 不一致`);
    checks++;
  }
}

// 2) 日期换算：覆盖月末、闰年、跨年
const dates: Array<[number, number, number]> = [
  [1990, 1, 1], [1990, 1, 31], [1990, 2, 28], [1990, 3, 1],
  [1992, 2, 28], [1992, 2, 29], [1992, 3, 1], [1990, 12, 31],
  [1991, 1, 1], [2000, 2, 28], [2000, 2, 29], [2000, 3, 1],
  [2020, 12, 31], [2021, 1, 1], [1990, 6, 15], [1991, 6, 15],
];

for (const [y, m, d] of dates) {
  for (const [h, min] of [[23, 0], [23, 30], [23, 59], [0, 0], [0, 59], [1, 0], [12, 0]] as const) {
    const e = engineResolve(y, m, d, h, min);
    const g = mirrorResolve(y, m, d, h, min);
    if (
      e.year !== g.year || e.month !== g.month || e.day !== g.day || e.hour !== g.hour
    ) {
      fail(
        `resolveChartDate(${y}-${m}-${d} ${h}:${min})：引擎 ` +
          `${e.year}-${e.month}-${e.day} h${e.hour} ≠ 镜像 ${g.year}-${g.month}-${g.day} h${g.hour}`,
      );
    }
    checks++;
  }
}

console.log(`✓ 输入层镜像与 @ziwei/chart-engine 完全一致（${checks} 个用例）`);
