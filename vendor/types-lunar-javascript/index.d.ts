/**
 * lunar-javascript 的类型声明。
 *
 * npm 上没有官方 @types/lunar-javascript，本仓库提供。
 * 以 workspace 包形式安装后，TypeScript 的自动 @types 解析会全局生效 ——
 * 任何引用 `lunar-javascript` 的包都不需要再单独 include 这个文件。
 *
 * 声明内容源自上游仓库 vendored 代码的实际用法
 * （packages/chart-engine/src/engine/algorithm.ts、lunar-solar.ts）。
 */
declare module 'lunar-javascript' {
  class Lunar {
    /** month 为负表示闰月（如 -5 = 闰五月） */
    static fromYmd(year: number, month: number, day: number): Lunar;
    getYear(): number;
    getMonth(): number; // negative = leap month
    getDay(): number;
    getYearGan(): string;
    getYearZhi(): string;
    getMonthGan(): string;
    getMonthZhi(): string;
    getDayGan(): string;
    getDayZhi(): string;
    /** 换算成公历 */
    getSolar(): Solar;
  }

  class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
  }

  /** 农历月信息（闰月大小月边界 clamp 用） */
  class LunarMonth {
    /** month 为负表示闰月（如 -5 = 闰五月）；查无此月返回 null */
    static fromYm(year: number, month: number): LunarMonth | null;
    getDayCount(): number;
  }
}
