import { chart } from '@ziwei/chart-engine';
const c = chart({ year: 1990, month: 1, day: 1, hour: 0, gender: 'male' });
console.log('lunar:', JSON.stringify(c.lunar));
console.log('mingGongBranch', c.mingGongBranch, 'shenGongBranch', c.shenGongBranch, 'wuxingJu', c.wuxingJu, c.wuxingJuName, 'ziweiPos', c.ziweiPos, 'mingZhu', c.mingZhu, 'shenZhu', c.shenZhu, 'yy', c.yinYangGender, 'age', c.currentAge);
console.log('--- palaces ---');
for (const p of c.palaces) {
  console.log(JSON.stringify({ b: p.branch, name: p.name, ganzhi: p.stemName+p.branchName, mg: p.isMingGong, sg: p.isShenGong, empty: p.isEmpty,
    borrow: p.borrowedFromName, borrowStars: p.borrowedStars, selfSihua: p.selfSihua, dx: p.daXianAge, cur: p.isCurrentDaXian,
    stars: p.stars.map(s=>`${s.name}[${s.type}]${s.brightnessRaw?`<${s.brightnessRaw}>`:''}${s.siHua?`{${s.siHua}}`:''}`) }));
}
console.log('--- daXians ---');
console.log(JSON.stringify(c.daXians.slice(0,4)));
console.log('daXians count', c.daXians.length);
