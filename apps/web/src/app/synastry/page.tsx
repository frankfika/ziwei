import Link from 'next/link';
import { getService } from '@/lib/service';
import { SI_HUA_TABLE } from '@ziwei/chart-engine';
import type { ChartJSON } from '@ziwei/chart-engine';
import { SHICHEN_NAMES } from '@/lib/birth';
import SynastryForm from '@/components/SynastryForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: '双人合盘' };

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function num(v: string | string[] | undefined): number {
  return Number(one(v));
}

/** 从 searchParams 读一个人的生辰；不完整返回 null */
function readPerson(
  sp: Record<string, string | string[] | undefined>,
  prefix: string,
): { year: number; month: number; day: number; hour: number; gender: 'male' | 'female'; name: string } | null {
  // 日期输入是 YYYY-MM-DD（type=date）；也兼容拆开的 y/m/d
  const dateRaw = one(sp[`${prefix}d`]);
  const year = num(sp[`${prefix}y`]) || Number(dateRaw.slice(0, 4));
  const month = num(sp[`${prefix}m`]) || Number(dateRaw.slice(5, 7));
  const day = Number(dateRaw.slice(8, 10));
  const hour = num(sp[`${prefix}h`]);
  const gender = one(sp[`${prefix}g`]);
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || hour < 0 || hour > 11 ||
    (gender !== 'male' && gender !== 'female')
  ) {
    return null;
  }
  return { year, month, day, hour, gender, name: one(sp[`${prefix}n`]).trim() };
}

export default async function SynastryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const a = readPerson(sp, 'a');
  const b = readPerson(sp, 'b');
  // edit=1 时显示表单（带回填），结果页「修改参数」用
  const edit = one(sp.edit) === '1';

  if (!a || !b || edit) {
    // 部分参数也回填进表单（结果页「修改参数」回来不用重输）
    const toParts = (p: ReturnType<typeof readPerson>) =>
      p ? { year: String(p.year), month: String(p.month), day: String(p.day) } : {};
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
        <h1 className="mb-2 font-serif text-title font-semibold text-ink">双人合盘</h1>
        <p className="mb-6 text-2xs leading-relaxed text-ink-3">
          输入两个人的生辰（或从档案直接选），看双方四化互飞与夫妻宫对照。互飞只列确定性的盘面事实，不做吉凶断语。
        </p>
        <SynastryForm
          initialA={a ? { name: a.name, gender: a.gender, ...toParts(a), hour: String(a.hour) } : undefined}
          initialB={b ? { name: b.name, gender: b.gender, ...toParts(b), hour: String(b.hour) } : undefined}
        />
      </div>
    );
  }

  const svc = getService();
  let chartA: ChartJSON;
  let chartB: ChartJSON;
  try {
    chartA = svc.chart(a);
    chartB = svc.chart(b);
  } catch (err) {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <p className="text-sm text-ink-2">{err instanceof Error ? err.message : '排盘失败。'}</p>
      </div>
    );
  }

  // 互飞四化：A 生年四化星 → B 盘落宫；反向同理
  const SIHUA_KEYS = ['禄', '权', '科', '忌'] as const;
  const crossAB = SIHUA_KEYS.map((label) => {
    const starName = starOfStem(chartA.lunar.yearStem, label);
    const palace = starName ? chartB.palaces.find((p) => p.stars.some((s) => s.name === starName)) : null;
    return { label, starName, palace };
  });
  const crossBA = SIHUA_KEYS.map((label) => {
    const starName = starOfStem(chartB.lunar.yearStem, label);
    const palace = starName ? chartA.palaces.find((p) => p.stars.some((s) => s.name === starName)) : null;
    return { label, starName, palace };
  });

  const mingA = chartA.palaces.find((p) => p.isMingGong);
  const mingB = chartB.palaces.find((p) => p.isMingGong);
  const spouseA = chartA.palaces.find((p) => p.name === '夫妻宫');
  const spouseB = chartB.palaces.find((p) => p.name === '夫妻宫');

  const labelOf = (p: { name: string; gender: 'male' | 'female' }) => p.name || (p.gender === 'male' ? '甲方' : '乙方');

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-8 text-center">
        <p className="text-2xs tracking-[0.35em] text-ink-2">双人合盘</p>
        <h1 className="mt-2 font-serif text-title font-semibold text-ink">
          {labelOf(a)} × {labelOf(b)}
        </h1>
        <p className="mt-1.5 text-xs text-ink-2">
          {a.year}年{a.month}月{a.day}日 {SHICHEN_NAMES[a.hour]}时 × {b.year}年{b.month}月{b.day}日{' '}
          {SHICHEN_NAMES[b.hour]}时 ·{' '}
          <Link
            href={`/synastry?an=${encodeURIComponent(a.name)}&ag=${a.gender}&ad=${a.year}-${String(a.month).padStart(2, '0')}-${String(a.day).padStart(2, '0')}&ah=${a.hour}&edit=1&bn=${encodeURIComponent(b.name)}&bg=${b.gender}&bd=${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}&bh=${b.hour}`}
            className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
          >
            修改参数
          </Link>
        </p>
      </header>

      {/* 双人命宫 / 夫妻宫对照 */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2" data-synastry-palaces>
        {[
          { who: labelOf(a), chart: chartA, ming: mingA, spouse: spouseA },
          { who: labelOf(b), chart: chartB, ming: mingB, spouse: spouseB },
        ].map(({ who, ming, spouse }) => (
          <div key={who} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-2xs text-ink-3">{who}</p>
            <p className="mt-1 text-sm text-ink">
              命宫：{ming?.majorStars.join('、') || '空宫'}（{ming?.branchName ?? ''}）
            </p>
            <p className="mt-1 text-sm text-ink">
              夫妻宫：{spouse?.majorStars.join('、') || '空宫'}（{spouse?.branchName ?? ''}）
            </p>
          </div>
        ))}
      </section>

      {/* 四化互飞 */}
      <section className="mb-6" data-synastry-cross>
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">
          四化互飞 · 一方的生年四化星落在对方盘的哪一宫
        </h2>
        {[
          { title: `${labelOf(a)} → ${labelOf(b)}`, rows: crossAB },
          { title: `${labelOf(b)} → ${labelOf(a)}`, rows: crossBA },
        ].map(({ title, rows }) => (
          <div key={title} className="mb-3 overflow-hidden rounded-xl border border-line">
            <p className="border-b border-lineSoft bg-surface-2 px-3 py-2 text-2xs text-ink-2">{title}</p>
            <table className="w-full text-left text-xs">
              <tbody>
                {rows.map(({ label, starName, palace }) => (
                  <tr key={label} className="border-t border-lineSoft first:border-0">
                    <th scope="row" className="w-28 px-3 py-2 font-medium text-ink">
                      化{label} · {starName}
                    </th>
                    <td className="px-3 py-2 text-ink-2">
                      落对方{palace ? `${palace.name}（${palace.branchName}）` : '盘（星不在对方盘）'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <p className="border-t border-lineSoft pt-4 text-2xs leading-relaxed text-ink-3">
        互飞四化是确定性的盘面事实（一方的生年四化星确实落在对方某宫）。合盘的吉凶解读不在数据集覆盖范围内，这里不做断语。各人本命的详细解读请看各自的{' '}
        <Link href="/" className="underline underline-offset-2 hover:text-zhu">命盘对话</Link>。仅供文化兴趣与学习参考。
      </p>
    </div>
  );
}

/** 天干索引 → 四化星名（直接查引擎表，不手抄） */
function starOfStem(stemIndex: number, label: string): string {
  const row = SI_HUA_TABLE[stemIndex];
  if (!row) return '';
  return label === '禄' ? row[0] : label === '权' ? row[1] : label === '科' ? row[2] : row[3];
}
