import { chart, chartSummary, shichenFromClock, resolveChartDate } from '@ziwei/chart-engine';

const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
console.log('命宫 branch:', c.mingGongBranch, '| 五行局:', c.wuxingJuName, '| 命主:', c.mingZhu);
console.log('palaces:', c.palaces.length, '| daXians:', c.daXians.length);
console.log('命宫主星:', c.palaces.find((p) => p.isMingGong)?.majorStars);
console.log('--- summary head ---');
console.log(chartSummary(c).split('\n').slice(0, 4).join('\n'));
console.log('--- shichen ---');
console.log('23:30 →', shichenFromClock(23, 30), '| 00:30 →', shichenFromClock(0, 30), '| 03:15 →', shichenFromClock(3, 15));
console.log('晚子时排盘日:', JSON.stringify(resolveChartDate(1990, 1, 1, 23, 30)));
