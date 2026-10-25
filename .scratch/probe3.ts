import { ZiweiService } from '@ziwei/core';
import { resolveChartDate, shichenFromClock } from '@ziwei/chart-engine';
const svc = new ZiweiService();

const r = svc.reading({ year: 1991, month: 6, day: 15, hour: 6, gender: 'female' });
console.log('=== not-covered case ===');
console.log(JSON.stringify(r, null, 1));

console.log('=== coverage ===');
console.log(JSON.stringify(svc.coverage(), null, 1));

console.log('=== late zi ===');
console.log('resolveChartDate(1990,1,1,23,30) =', JSON.stringify(resolveChartDate(1990, 1, 1, 23, 30)));
console.log('shichenFromClock(23,30) =', shichenFromClock(23, 30));

const c2 = svc.chart({ year: 1990, month: 1, day: 2, hour: 0, gender: 'male' });
console.log('1990-01-02 hour0 mingGong:', c2.palaces.find(p=>p.isMingGong)?.branchName, c2.wuxingJuName, c2.mingZhu, JSON.stringify(c2.palaces.find(p=>p.isMingGong)?.majorStars));
const c1 = svc.chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
console.log('1990-01-01 hour0 mingGong:', c1.palaces.find(p=>p.isMingGong)?.branchName, c1.wuxingJuName, c1.mingZhu, JSON.stringify(c1.palaces.find(p=>p.isMingGong)?.majorStars));

// key-not-found inside an indexed year?
const idx = svc.index as any;
console.log('1990 indexed years:', idx.indexedYears());
console.log('has 1990-01-01-0-male:', idx.has({year:1990,month:1,day:1,hour:0,gender:'male'}));
console.log('has 1990-06-31? try 1990-02-29:', idx.has({year:1990,month:2,day:29,hour:0,gender:'male'}));
