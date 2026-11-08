'use client';

/**
 * 年度运势报告的界面层（客户端）—— 语言切换要靠 useLang，
 * 数据（盘面事实、星曜名、宫名）由服务端算好传进来。
 */

import { useState } from 'react';
import Link from 'next/link';
import { SHICHEN_NAMES } from '@/lib/birth';
import { useLang } from '@/lib/lang';
import { READING_COPY } from '@/lib/readingCopy';

export interface ReportData {
  name: string;
  birth: { year: number; month: number; day: number; hour: number; gender: 'male' | 'female' };
  nowYear: number;
  /** 流年干支（数据原文） */
  ganzhi: string;
  /** 流年命宫所落本命宫 */
  liunianMing: { name: string; branchName: string; majorStars: string[] } | null;
  /** 流年四化：落本命宫 + 即流年宫 */
  sihua: Array<{
    label: string;
    star: string;
    natalName: string;
    natalBranch: string;
    liunianPalace: string | null;
  }>;
  /** 流年十二宫落位 */
  placements: Array<{ name: string; natalName: string; natalBranch: string; stars: string[] }>;
  /** 当前大限 */
  daxian: {
    startAge: number;
    endAge: number;
    palaceName: string;
    stemName: string;
    sihua: { lu: string; quan: string; ke: string; ji: string } | null;
  } | null;
  /** 大限层是否可用（决定要不要出现那段说明） */
  daxianNote: boolean;
  /** 命格总览原文节选 */
  overview: { text: string; chars: number } | null;
  /** 各月流月命宫 */
  liuyue: Array<{ label: string; palace: string }>;
  chartUrl: string;
  shareUrl: string;
}

/** 报告页打不开时的提示（参数不全 / 排盘失败） */
export function ReportInvalid({
  kind,
  message,
}: {
  kind: 'params' | 'error';
  message?: string;
}) {
  const [lang] = useLang();
  const copy = READING_COPY[lang];
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
      <div className="panel mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg tracking-wide text-ink">{copy.reportInvalidTitle}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-2" role="alert">
          {kind === 'params' ? copy.reportInvalidParams : message ?? copy.reportInvalidFailed}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep"
        >
          {copy.reportInvalidHome}
        </Link>
      </div>
    </div>
  );
}

/** 复制报告链接（自带中英反馈） */
function CopyLink({ path, label, copiedLabel }: { path: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 剪贴板不可用忽略 */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

export default function ReportView({ data }: { data: ReportData }) {
  const [lang] = useLang();
  const copy = READING_COPY[lang];
  const { name, birth, nowYear, ganzhi } = data;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      {/* 头 */}
      <header className="mb-8 text-center">
        <p className="text-2xs tracking-[0.35em] text-ink-2">{copy.reportTitle}</p>
        <h1 className="mt-2 font-serif text-title font-semibold text-ink">
          {name ? `${name} · ` : ''}
          {copy.yearGanzhi(nowYear, ganzhi)}
        </h1>
        <p className="mt-1.5 text-xs text-ink-2">
          {copy.birthDate(birth.year, birth.month, birth.day)} ·{' '}
          {copy.shichen(SHICHEN_NAMES[birth.hour])} · {copy.gender(birth.gender)} ·{' '}
          <Link href={data.chartUrl} className="underline underline-offset-2 hover:text-zhu">
            {copy.viewFullChart}
          </Link>
          {' · '}
          <CopyLink path={data.shareUrl} label={copy.copyLink} copiedLabel={copy.linkCopied} />
        </p>
      </header>

      {/* 流年命宫 */}
      <section className="panel-ritual mb-6 p-5" data-report="liunian-ming">
        <h2 className="mb-2 text-xs font-medium tracking-wide2 text-ink-2">{copy.liunianMing}</h2>
        <p className="text-sm text-ink">
          {copy.liunianMingPrefix}{' '}
          <span className="font-semibold text-zhu">{data.liunianMing?.name ?? '—'}</span>
          {data.liunianMing && copy.parens(data.liunianMing.branchName)}
          {data.liunianMing && data.liunianMing.majorStars.length > 0 && (
            <span className="ml-2 text-ink-2">
              {copy.natalStars}
              {data.liunianMing.majorStars.join('、')}
            </span>
          )}
        </p>
        <p className="mt-1.5 text-2xs leading-relaxed text-ink-3">{copy.liunianMingNote}</p>
      </section>

      {/* 流年四化 */}
      <section className="mb-6" data-report="sihua">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">{copy.sihuaTitle}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.sihua.map(({ label, star, natalName, natalBranch, liunianPalace }) => (
            <div key={label} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{copy.sihuaRow(label, star)}</p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-2">
                {copy.sihuaPlace(natalName, natalBranch, liunianPalace)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 流年十二宫落位 */}
      <section className="mb-6" data-report="placements">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">
          {copy.placementsTitle}
        </h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <tbody>
              {data.placements.map((p, i) => (
                <tr key={p.name} className={i % 2 === 0 ? 'bg-surface' : 'bg-paper'}>
                  <th scope="row" className="w-24 px-3 py-2 font-medium text-ink">{p.name}</th>
                  <td className="px-3 py-2 text-ink-2">
                    {copy.placementsCell(p.natalName, p.natalBranch)}
                  </td>
                  <td className="px-3 py-2 text-ink-3">
                    {p.stars.length > 0 ? p.stars.join('、') : copy.emptyPalace}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 当前大限 */}
      {data.daxian && (
        <section className="panel-ritual mb-6 p-5" data-report="daxian">
          <h2 className="mb-2 text-xs font-medium tracking-wide2 text-ink-2">
            {copy.daxianTitle(data.daxian.startAge, data.daxian.endAge)}
          </h2>
          <p className="text-sm text-ink">
            {copy.daxianMing(data.daxian.palaceName, data.daxian.stemName)}
          </p>
          {data.daxian.sihua && (
            <p className="mt-1 text-2xs leading-relaxed text-ink-2">
              {copy.daxianSihua(
                data.daxian.sihua.lu,
                data.daxian.sihua.quan,
                data.daxian.sihua.ke,
                data.daxian.sihua.ji,
              )}
            </p>
          )}
          {data.daxianNote && (
            <p className="mt-1 text-2xs leading-relaxed text-ink-3">{copy.daxianNote}</p>
          )}
        </section>
      )}

      {/* 命格总览（数据集原文节选） */}
      {data.overview && (
        <section className="mb-6" data-report="overview">
          <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">
            {lang === 'en' ? copy.overviewTitleEn : copy.overviewTitleZh}
          </h2>
          <div className="max-w-[40rem] whitespace-pre-wrap text-sm leading-[1.95] text-ink-2">
            {data.overview.text}
          </div>
          <p className="mt-2 text-2xs text-ink-3">
            {copy.overviewChars(data.overview.chars)}{' '}
            <Link
              href={`${data.chartUrl}#reading`}
              className="underline underline-offset-2 hover:text-zhu"
            >
              {copy.overviewLink}
            </Link>
            {copy.period}
          </p>
        </section>
      )}

      {/* 各月流月速览 */}
      <section className="mb-6" data-report="liuyue">
        <h2 className="mb-3 text-xs font-medium tracking-wide2 text-ink-2">
          {copy.liuyueTitle(nowYear)}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {data.liuyue.map(({ label, palace }) => (
            <span
              key={label}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-2xs text-ink-2"
            >
              {copy.liuyueItem(label, palace)}
            </span>
          ))}
        </div>
      </section>

      <p className="border-t border-lineSoft pt-4 text-2xs leading-relaxed text-ink-3">
        {copy.reportFooter}{' '}
        <Link href="/about" className="underline underline-offset-2 hover:text-zhu">
          {copy.about}
        </Link>
        {copy.reportFooterEnd}
      </p>
    </div>
  );
}
