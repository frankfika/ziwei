import Link from 'next/link';

/**
 * 页脚署名与免责声明 —— 文案取自 docs/ARCHITECTURE.md 第 5 节，**不可删改来源**。
 */
const ATTRIBUTION = [
  '本项目使用了「紫微斗数开源解读数据集 v4.0」（674,976 张命盘 × 13 维）',
  '以及开源排盘引擎。',
  '来源：https://github.com/Renhuai123/ziwei-doushu',
  '作者：王多鱼AI',
  '数据集许可：CC BY 4.0；引擎代码：MIT。',
];

const DISCLAIMER =
  '本工具仅供文化兴趣与学习之用，不构成任何医疗、法律、投资或人生决策建议。';

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="max-w-2xl">
            <p className="whitespace-pre-line text-xs leading-relaxed text-ink-2">
              {ATTRIBUTION.join('\n')}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">{DISCLAIMER}</p>
            <p className="mt-3 text-2xs leading-relaxed text-ink-3">
              排盘由确定性引擎计算，不使用大模型推算星曜与宫位；解读正文均检索自上述开源数据集，
              样本库未覆盖的生辰会如实标注，不做任何补写。
            </p>
          </div>
          <div className="flex flex-col gap-2 text-2xs text-ink-3 md:items-end">
            <Link href="/about" className="transition-colors hover:text-ink">
              口径说明
            </Link>
            <Link href="/" className="transition-colors hover:text-ink">
              重新排盘
            </Link>
            <span className="md:mt-2 md:text-ink-3">紫微助手 · MVP</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
