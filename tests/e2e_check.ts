import { ZiweiService } from '@ziwei/core';

const svc = new ZiweiService();

// 1) 命盘
const birth = { year: 1990, month: 1, day: 1, hour: 0, gender: 'male' as const };
const c = svc.chart(birth);
console.log(`盘: 命宫${c.palaces.find((p) => p.isMingGong)?.branchName} ${c.wuxingJuName} 命主${c.mingZhu}`);

// 2) 解读
const r = svc.reading(birth);
if (r.status === 'ok') {
  console.log(`解读: key=${r.key} ms=${r.ms} 维度数=${r.dimensions.length} 总字数=${r.totalChars}`);
  console.log(`  维度: ${r.dimensions.map((d) => d.label).join('/')}`);
  console.log(`  首句: ${r.dimensions[0].text.slice(0, 80)}...`);
} else {
  console.log(`未覆盖: ${r.message}`);
}

// 3) 覆盖情况
console.log('覆盖:', JSON.stringify(svc.coverage()));

// 4) 未覆盖分支（2020 有索引，但取一个不存在的时辰组合之外的年份）
const miss = svc.reading({ year: 1991, month: 1, day: 1, hour: 0, gender: 'male' });
console.log('未覆盖年份:', miss.status === 'not-covered' ? miss.message.slice(0, 80) : '?!意外命中');
