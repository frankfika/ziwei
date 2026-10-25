import { ReadingIndex } from '@ziwei/reading-index';
const idx = new ReadingIndex();
const r = idx.getByKey('1990-06-15-6-female');
if (r.found) {
  const c = r.record.c as Record<string,string>;
  console.log('### OVERVIEW ###');
  console.log(c.overview);
  console.log('### CAREER ###');
  console.log(c.career);
}
