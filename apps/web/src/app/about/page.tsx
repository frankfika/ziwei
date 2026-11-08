import Link from 'next/link';
import { cookies } from 'next/headers';
import { DIMENSION_LABELS, READING_DIMENSIONS } from '@ziwei/core';
import { getService } from '@/lib/service';
import { SHICHEN_NAMES, SHICHEN_RANGES } from '@/lib/birth';
import { langFromCookie } from '@/lib/langServer';
import { SITE_COPY } from '@/lib/siteCopy';
import Seal from '@/components/Seal';

export const dynamic = 'force-dynamic';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="mb-4 text-base tracking-[0.2em] text-ink">{title}</h2>
      <div className="space-y-3 text-[15px] leading-[1.9] text-ink-2">{children}</div>
    </section>
  );
}

export default async function AboutPage() {
  const coverage = getService().coverage();
  const years = coverage.indexedYears;
  // 语言来自 cookie（切语言时写入）：服务端直接出对应语言
  const jar = await cookies();
  const lang = langFromCookie(jar.get('ziwei_lang')?.value);
  const copy = SITE_COPY[lang];

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="mb-10">
        <p className="mb-2 text-2xs tracking-[0.3em] text-ink-3">ABOUT</p>
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-3xl font-semibold tracking-[0.12em] text-ink">{copy.aboutTitle}</h1>
          {/* 朱砂印落款：与首页 hero / 开盘仪式的印同源 */}
          <Seal />
        </div>
        <p className="mt-4 text-[15px] leading-[1.9] text-ink-2">{copy.aboutIntro}</p>
      </header>

      <div className="space-y-8">
        <Section title={copy.aboutSectionMethod}>
          <ul className="space-y-2.5">
            <li>
              <span className="text-ink">{copy.aboutMethodHourLead}</span>{lang === 'en' ? ' ' : ''}
              {copy.aboutMethodHourBody}
              {SHICHEN_NAMES.map((n, i) => (
                <span key={n} className="ml-1 whitespace-nowrap">
                  {copy.shichenLabel(n)} {SHICHEN_RANGES[i]}
                  {i < SHICHEN_NAMES.length - 1 ? copy.aboutHourSep : copy.aboutHourEnd}
                </span>
              ))}
            </li>
            <li>
              <span className="text-ink">{copy.aboutMethodDateLead}</span>{lang === 'en' ? ' ' : ''}
              {copy.aboutMethodDateBody}
            </li>
            <li>
              <span className="text-ink">{copy.aboutMethodLateZiLead}</span>{lang === 'en' ? ' ' : ''}
              {copy.aboutMethodLateZiBody}
            </li>
            <li>
              <span className="text-ink">{copy.aboutMethodBirthplaceLead}</span>{lang === 'en' ? ' ' : ''}
              {copy.aboutMethodBirthplaceBody}
            </li>
          </ul>
        </Section>

        <Section title={copy.aboutSectionLookup}>
          <p>
            {copy.aboutLookupKeyLead}
            <code className="mx-1 rounded bg-paper px-1.5 py-0.5 font-mono text-[13px] text-ink">
              {copy.aboutLookupKeyFormat}
            </code>
            {copy.aboutLookupKeyTail}
          </p>
          <p>
            {copy.aboutLookupYearsLead}
            <span className="tabular-nums text-ink">
              {years.length === 0
                ? copy.aboutLookupYearsNone
                : years.length <= 12
                  ? years.join(' / ')
                  : copy.aboutLookupYearsRange(years[0], years[years.length - 1], years.length)}
            </span>
            {copy.aboutLookupRecords(
              coverage.totalRecords.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN'),
            )}
            {copy.aboutLookupMissing}
          </p>
        </Section>

        <Section title={copy.aboutSectionDimensions}>
          <p className="text-ink-2">{copy.aboutDimensionsIntro}</p>
          <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {READING_DIMENSIONS.map((d, i) => (
              <li key={d} className="flex gap-2 text-sm">
                <span className="tabular-nums text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-ink">{copy.dimensionLabel(DIMENSION_LABELS[d])}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={copy.aboutSectionImpl}>
          <p>
            <AboutImplLayout lang={lang} />
          </p>
          <p>{copy.aboutImplMarkdown}</p>
        </Section>

        <Section title={copy.aboutSectionCredits}>
          <p className="text-ink-2">{copy.datasetIntro}</p>
          <p className="text-ink-2">
            {copy.datasetSource}
            <a
              href="https://github.com/Renhuai123/ziwei-doushu"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zhu underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
            >
              https://github.com/Renhuai123/ziwei-doushu
            </a>
          </p>
          <p className="text-ink-2">{copy.datasetAuthor}</p>
          <p className="text-ink-2">{copy.datasetLicense}</p>
          <p className="text-ink-2">{copy.disclaimer}</p>
          <p className="text-ink-3">{copy.aboutCreditsNi}</p>
        </Section>
      </div>

      <div className="mt-12">
        <Link
          href="/new"
          className="inline-flex items-center rounded-lg bg-zhu px-5 py-2.5 text-sm text-white transition-colors hover:bg-zhu-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {copy.aboutCta}
        </Link>
      </div>
    </div>
  );
}

/** 实现说明里带 mono 代码片段的那段：按语言把 `code` 反引号片段渲染成 <span> */
function AboutImplLayout({ lang }: { lang: 'zh' | 'en' }) {
  const copy = SITE_COPY[lang];
  const parts = copy.aboutImplLayout.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mx-1 font-mono text-[13px] text-ink">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
