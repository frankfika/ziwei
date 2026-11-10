'use client';

/**
 * 「排一张新盘」页的界面骨架。
 *
 * page.tsx 是 Server Component（年份索引要走服务端口径），所以标题与回链
 * 这两块可翻译的部分放在这里这个客户端子组件里。
 */

import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import Seal from '@/components/Seal';
import { FORM_COPY } from '@/lib/formCopy';
import { useLang } from '@/lib/lang';

export default function NewChartClient({
  indexedYears,
}: {
  /** 服务端已建索引的年份 */
  indexedYears: number[];
}) {
  const [lang] = useLang();
  const copy = FORM_COPY[lang];

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      {/* 标题 + 朱砂印：与首页 hero / 开盘仪式的印同源，排盘是开盘仪式的入口 */}
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-serif text-[1.45rem] leading-snug text-ink sm:text-[1.6rem]">
          {copy.pageTitle}
        </h1>
        <Seal />
      </div>

      <BirthForm indexedYears={indexedYears} />

      <p className="mt-4 text-xs text-ink-2">
        <Link
          href="/"
          className="underline underline-offset-2 transition-colors hover:text-zhu focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zhu"
        >
          {copy.backLink}
        </Link>
      </p>
    </div>
  );
}
