import { ZiweiService } from '@ziwei/core';
const svc = new ZiweiService();
const c = svc.chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
console.log('palace branch order:', c.palaces.map(p => `${p.branch}:${p.branchName}:${p.name}`).join(' | '));
console.log('current daXian palace:', c.palaces.filter(p => p.isCurrentDaXian).map(p => `${p.name}(${p.branchName}) ${JSON.stringify(p.daXianAge)}`));
console.log('palaces with selfSihua:', JSON.stringify(c.palaces.filter(p=>p.selfSihua).map(p=>({n:p.name,s:p.selfSihua}))));
console.log('stars with siHua:', JSON.stringify(c.palaces.flatMap(p=>p.stars.filter(s=>s.siHua).map(s=>({palace:p.name,...s})))));
console.log('daXians:', JSON.stringify(c.daXians.map(d=>({a:[d.startAge,d.endAge],br:d.palaceBranch,n:d.palaceName,si:d.siHua}))));
console.log('--- READING ---');
const r = svc.reading({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
if (r.status === 'ok') {
  console.log('key', r.key, 'ms', r.ms, 'totalChars', r.totalChars, 'dims', r.dimensions.length);
  for (const d of r.dimensions) console.log(`  ${d.key} ${d.label} chars=${d.chars} len=${d.text.length}`);
} else {
  console.log('NOT COVERED', JSON.stringify(r, null, 1));
}
