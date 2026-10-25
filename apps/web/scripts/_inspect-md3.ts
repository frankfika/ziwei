import { ReadingIndex } from '@ziwei/reading-index';
const idx = new ReadingIndex();
const keys = ['1990-06-15-6-female','2000-03-03-9-male','2020-12-31-11-female','1990-01-01-0-male','2000-02-29-3-female'];
let wrapped = 0, total = 0; const ex: string[] = [];
const indent = new Map<string, number>();
for (const k of keys) {
  const r = idx.getByKey(k);
  if (!r.found) continue;
  for (const v of Object.values(r.record.c as Record<string,string>)) {
    const lines = v.split('\n');
    for (let i=0;i<lines.length;i++) {
      const t = lines[i].trim();
      if (!t) continue;
      total++;
      const lead = lines[i].match(/^\s*/)?.[0].length ?? 0;
      indent.set(String(lead), (indent.get(String(lead))??0)+1);
      const prev = lines[i-1]?.trim() ?? '';
      if (prev && !/[*>#\]）】」』]$/.test(prev) && !/^[*>#·▍▸✦🔵◇⭐]|^\d+[.、)]/.test(t) && /[一-龥a-zA-Z0-9，、；：]$/.test(prev)) {
        wrapped++; if (ex.length<8) ex.push(prev.slice(-25)+' ⏎ '+t.slice(0,25));
      }
    }
  }
}
console.log('total non-empty lines:', total, 'possible mid-sentence wraps:', wrapped);
console.log(ex.join('\n'));
console.log('indent histogram:', JSON.stringify(Object.fromEntries(indent)));
