import { ReadingIndex } from '@ziwei/reading-index';
const idx = new ReadingIndex();
const keys = ['1990-06-15-6-female','2000-03-03-9-male','2020-12-31-11-female','1990-01-01-0-male'];
const samples: Record<string, string[]> = { quote: [], hr: [], link: [], html: [], code: [] };
for (const k of keys) {
  const r = idx.getByKey(k);
  if (!r.found) continue;
  for (const v of Object.values(r.record.c as Record<string,string>)) {
    for (const raw of v.split('\n')) {
      const t = raw.trim();
      if (t.startsWith('>')) samples.quote.push(t.slice(0,70));
      if (t === '---' || t.startsWith('---')) samples.hr.push(t.slice(0,70));
      if (t.includes('[') && t.includes(']')) samples.link.push(t.slice(0,90));
      if (/<[a-zA-Z\/]/.test(t)) samples.html.push(t.slice(0,70));
      if (t.includes('`')) samples.code.push(t.slice(0,70));
    }
  }
}
for (const [k,v] of Object.entries(samples)) console.log('==',k,v.length,'==\n'+v.slice(0,4).join('\n'));
