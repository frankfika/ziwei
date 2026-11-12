'use client';

/**
 * 「排一张新盘」页的界面骨架。
 *
 * page.tsx 是 Server Component（年份索引要走服务端口径），所以标题与回链
 * 这两块可翻译的部分放在这里这个客户端子组件里。
 *
 * Server Action 校验失败会带 error + 原表单值回跳到本页：
 * 这里把 rawForm 还原成 BirthFormState、把 errorKey 查成双语文案，
 * 用户回来看到的是自己刚才填的内容 + 一句人话错误，而不是空表单。
 */

import Link from 'next/link';
import BirthForm from '@/components/BirthForm';
import Seal from '@/components/Seal';
import { FORM_COPY } from '@/lib/formCopy';
import { useLang } from '@/lib/lang';
import { formatDate, type BirthErrorCode, type BirthFormState } from '@/lib/birth';

/** actions.ts 的 ?error= 短码 → birth.ts 的稳定错误码 */
const ERROR_MAP: Record<string, BirthErrorCode> = {
  year: 'year-range',
  month: 'month-range',
  day: 'day-range',
  date: 'invalid-date',
  clock: 'invalid-clock',
  shichen: 'missing-shichen',
};

/** 回跳参数 → 表单初值；只认合法值，垃圾参数直接丢弃 */
function restoreForm(raw: Record<string, string>): Partial<BirthFormState> {
  const out: Partial<BirthFormState> = {};
  if (raw.name) out.name = raw.name;
  if (/^\d{1,4}$/.test(raw.year ?? '')) out.year = raw.year;
  if (/^\d{1,2}$/.test(raw.month ?? '')) out.month = raw.month;
  if (/^\d{1,2}$/.test(raw.day ?? '')) out.day = raw.day;
  if (raw.timeMode === 'clock' || raw.timeMode === 'shichen') out.timeMode = raw.timeMode;
  if (raw.shichen !== undefined && raw.shichen !== '') {
    const s = Number(raw.shichen);
    if (Number.isInteger(s) && s >= 0 && s <= 11) out.shichen = s;
  }
  if (raw.ziVariant === 'next' || raw.ziVariant === 'same') out.ziVariant = raw.ziVariant;
  if (/^\d{1,2}$/.test(raw.clockHour ?? '')) out.clockHour = raw.clockHour;
  if (/^\d{1,2}$/.test(raw.clockMinute ?? '')) out.clockMinute = raw.clockMinute;
  if (raw.gender === 'male' || raw.gender === 'female') out.gender = raw.gender;
  return out;
}

export default function NewChartClient({
  indexedYears,
  rawForm = {},
  errorKey = '',
}: {
  /** 服务端已建索引的年份 */
  indexedYears: number[];
  /** Server Action 回跳带来的原表单值（已拍平成字符串） */
  rawForm?: Record<string, string>;
  /** Server Action 回跳的错误短码（year/month/day/date/clock/shichen） */
  errorKey?: string;
}) {
  const [lang] = useLang();
  const copy = FORM_COPY[lang];

  const code = ERROR_MAP[errorKey];
  const errorText = code
    ? copy.errors[code](
        code === 'invalid-date'
          ? formatDate(Number(rawForm.year), Number(rawForm.month), Number(rawForm.day))
          : undefined,
      )
    : '';

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      {/* 标题 + 朱砂印：与首页 hero / 开盘仪式的印同源，排盘是开盘仪式的入口 */}
      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-serif text-[1.45rem] leading-snug text-ink sm:text-[1.6rem]">
          {copy.pageTitle}
        </h1>
        <Seal />
      </div>

      <BirthForm indexedYears={indexedYears} initialForm={restoreForm(rawForm)} errorText={errorText} />

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
