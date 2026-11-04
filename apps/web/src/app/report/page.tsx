import Link from 'next/link';
import { liuNianLayer, daXianLayer, liuYueLayer, type ChartJSON } from '@ziwei/chart-engine';
import { getService } from '@/lib/service';
import { SHICHEN_NAMES, GENDER_LABEL } from '@/lib/birth';
import CopyLinkButton from '@/components/CopyLinkButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: '年度运势报告' };

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

function invalid(message: string) {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg tracking-wide text-ink">无法生成报告</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2" role="alert">
          {message}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep"
        >
          回到首页
        </Link>
      </div>
    </div>
  );
}

const CN_MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const year = Number(one(sp.y));
  const month = Number(one(sp.m));
  const day = Number(one(sp.d));
  const hour = Number(one(sp.h));
  const genderRaw = one(sp.g);
  const name = one(sp.n).trim();

  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || hour < 0 || hour > 11 ||
    (genderRaw !== 'male' && genderRaw !== 'female')
  ) {
    return invalid('参数不完整，请从命盘页或首页进入。');
  }
  const gender = genderRaw as 'male' | 'female';

  const svc = getService();
  let reading: ReturnType<typeof svc.reading>;
  let chart: ReturnType<typeof svc.chart>;
  try {
    const birth = { year, month, day, hour, gender, ...(name ? { name } : {}) };
    chart = svc.chart(birth);
    reading = svc.reading(birth);
  } catch (err) {
    return invalid(err instanceof Error ? err.message : '排盘失败。');
  }

  const nowYear = new Date().getFullYear();
  const ln = liuNianLayer(chart, nowYear);
  const lnMing = chart.palaces.find((p) => p.branch === ln.mingBranch);
  const dxPalace = chart.palaces.find((p) => p.isCurrentDaXian);
  const dxIndex = dxPalace ? chart.daXians.findIndex((d) => d.palaceBranch === dxPalace.branch) : -1;
  const dx = dxIndex >= 0 ? chart.daXians[dxIndex] : null;
  const dxLayer = dxIndex >= 0 ? daXianLayer(chart, dxIndex) : null;

  // 流年四化落宫 → 对应流年宫名
  const siHuaRows = (['lu', 'quan', 'ke', 'ji'] as const).map((key) => {
    const label = key === 'lu' ? '禄' : key === 'quan' ? '权' : key === 'ke' ? '科' : '忌';
    const starName = ln.siHua[key];
    const branch = (ln.siHuaPalaces as Record<string, number | undefined>)[label];
    const natal = branch !== undefined ? chart.palaces.find((p) => p.branch === branch) : null;
    const liunianPalace = branch !== undefined ? ln.palaces.find((p) => p.branch === branch) : null;
    return { label, starName, natal, liunianPalace };
  });

  // 流年十二宫落位
  const placements = ln.palaces.map((lp) => {
    const natal = chart.palaces.find((p) => p.branch === lp.branch);
    return { ...lp, natalName: natal?.name ?? '', branchName: natal?.branchName ?? '', stars: natal?.majorStars ?? [] };
  });

  const overview = reading.status === 'ok' ? reading.dimensions.find((d) => d.key === 'overview') : null;
  const shareUrl = `/report?y=${year}&m=${month}&d=${day}&h=${hour}&g=${gender}${name ? `&n=${encodeURIComponent(name)}` : ''}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      {/* 头 */}
      <header className="mb-8 text-center">
        <p className="text-2xs tracking-[0.35em] text-ink-2">年度运势报告</p>
        <h1 className="mt-2 font-serif text-title font-semibold text-ink">
          {name ? `${name} · ` : ''}
          {nowYear} {ln.ganzhi}年
        </h1>
        <p className="mt-1.5 text-xs text-ink-2">
          {`${year}年${month}月${day}日`} · {SHICHEN_NAMES[hour]}时 · {GENDER_LABEL[gender]} ·{' '}
          <Link href={`/chart?y=${year}&m=${month}&d=${day}&h=${hour}&g=${gender}${name ? `&n=${encodeURIComponent(name)}` : ''}`} className="underline underline-offset-2 hover:text-zhu">
            看完整命盘
          </Link>
          {' · '}
          <CopyLinkButton path={shareUrl} />
        </p>
      </header>

      {/* 流年命宫 */}
      <section className="panel-ritual mb-6 p-5" data-report="liunian-ming">
        <h2 className="mb-2 text-xs font-medium tracking-wide2 text-ink-2">流年命宫</h2>
        <p className="text-sm text-ink">
          落在本命 <span className="font-semibold text-zhu">{lnMing?.name ?? '—'}</span>
          （{lnMing?.branchName ?? ''}）
          {lnMing && lnMing.majorStars.length > 0 && (
            <span className="ml-2 text-ink-2">本命主星：{lnMing.majorStars.join('、')}</span>
          )}
        </p>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">
          流年命宫是这一年的主舞台：流年十二宫都从这里起排。
        </p>
      </section>

      {/* 流年四化 */}
      <section className="mb-6" data-report="sihua">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">流年四化 · 四颗引动星</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {siHuaRows.map(({ label, starName, natal, liunianPalace }) => (
            <div key={label} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">
                化{label} · {starName}
              </p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-2">
                落本命{natal?.name ?? '—'}（{natal?.branchName ?? ''}）
                {liunianPalace && <>，即流年{liunianPalace.name}</>}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 流年十二宫落位 */}
      <section className="mb-6" data-report="placements">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">流年十二宫落位</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <tbody>
              {placements.map((p, i) => (
                <tr key={p.name} className={i % 2 === 0 ? 'bg-surface' : 'bg-paper'}>
                  <th scope="row" className="w-24 px-3 py-2 font-medium text-ink">{p.name}</th>
                  <td className="px-3 py-2 text-ink-2">
                    在本命{natal_name(p.natalName, p.branchName)}宫
                  </td>
                  <td className="px-3 py-2 text-ink-3">{p.stars.length > 0 ? p.stars.join('、') : '空宫'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 当前大限 */}
      {dx && (
        <section className="panel-ritual mb-6 p-5" data-report="daxian">
          <h2 className="mb-2 text-xs font-medium tracking-wide2 text-ink-2">
            所处大限 · {dx.startAge}–{dx.endAge} 岁
          </h2>
          <p className="text-sm text-ink">
            大限命宫在{dx.palaceName}（{dx.stemName ?? ''}）
          </p>
          {dx.siHua && (
            <p className="mt-1 text-2xs leading-relaxed text-ink-2">
              大限四化：禄 {dx.siHua.lu} · 权 {dx.siHua.quan} · 科 {dx.siHua.ke} · 忌 {dx.siHua.ji}
            </p>
          )}
          {dxLayer && (
            <p className="mt-1 text-2xs leading-relaxed text-ink-3">
              这步大限的十年里，流年层叠加在大限层之上看：先看大限给什么舞台，再看流年引动什么。
            </p>
          )}
        </section>
      )}

      {/* 命格总览（数据集原文节选） */}
      {overview && overview.text && (
        <section className="mb-6" data-report="overview">
          <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">
            命格总览 · 数据集原文节选
          </h2>
          <div className="max-w-[40rem] whitespace-pre-wrap text-sm leading-[1.95] text-ink-2">
            {stripMd(overview.text.length > 800 ? `${overview.text.slice(0, 800)}…` : overview.text)}
          </div>
          <p className="mt-2 text-2xs text-ink-3">
            共 {overview.chars.toLocaleString('zh-CN')} 字，完整版见{' '}
            <Link href={`/chart?y=${year}&m=${month}&d=${day}&h=${hour}&g=${gender}${name ? `&n=${encodeURIComponent(name)}` : ''}#reading`} className="underline underline-offset-2 hover:text-zhu">
              命盘解读
            </Link>
            。
          </p>
        </section>
      )}

      {/* 各月流月速览 */}
      <section className="mb-6" data-report="liuyue">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">{nowYear} 各月流月命宫</h2>
        <div className="flex flex-wrap gap-1.5">
          {CN_MONTH_NAMES.map((label, i) => {
            const ly = liuYueSafe(chart, nowYear, i + 1);
            const natal = chart.palaces.find((p) => p.branch === ly?.mingBranch);
            return (
              <span key={label} className="rounded-full border border-line bg-surface px-2.5 py-1 text-2xs text-ink-2">
                {label} · 命宫在{natal?.name.replace('宫', '') ?? '—'}
              </span>
            );
          })}
        </div>
      </section>

      <p className="border-t border-lineSoft pt-4 text-2xs leading-relaxed text-ink-3">
        本报告的盘面事实全部由确定性引擎计算，未覆盖的解读如实标注、不补写。流年流月为传统命理分层口径，仅供文化兴趣与学习参考，不构成任何决策建议。口径详见{' '}
        <Link href="/about" className="underline underline-offset-2 hover:text-zhu">关于与口径</Link>。
      </p>
    </div>
  );
}

/** 报告节选去掉 markdown 强调记号（节选不渲染富文本，直接显示原文会更干净） */
function stripMd(text: string): string {
  return text.replace(/\*\*/g, '');
}

function natal_name(natalName: string, branchName: string): string {
  return `${natalName || ''}${branchName ? `（${branchName}）` : ''}`;
}

function liuYueSafe(chart: ChartJSON, year: number, month: number) {
  try {
    return liuYueLayer(chart, year, month);
  } catch {
    return null;
  }
}
