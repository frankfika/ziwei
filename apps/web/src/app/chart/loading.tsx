/** 骨架格位：4×4 十二宫，中央 2×2 是中宫（与真盘同几何） */
const CELLS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [2, 1], [3, 1], [4, 1],
  [1, 2], [4, 2],
  [1, 3], [4, 3],
  [1, 4], [2, 4], [3, 4], [4, 4],
];

export default function ChartLoading() {
  return (
    <div
      className="chart-submit mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-8">
        <div className="h-3 w-24 animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="mt-3 h-8 w-72 max-w-full animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="mt-4 flex gap-2">
          <div className="h-9 w-24 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft" />
          <div className="h-9 w-24 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft" />
        </div>
      </div>

      {/* 4×4 骨架：矮格 + 中宫，hairline 内描边（无「水泥缝」） */}
      <div
        className="grid grid-cols-4 gap-1 h-[18rem] md:h-[26rem]"
        style={{ gridTemplateRows: 'repeat(4, minmax(0, 1fr))' }}
      >
        {CELLS.map(([col, row]) => (
          <div
            key={`${col}-${row}`}
            style={{ gridColumn: col, gridRow: row }}
            className="animate-pulse motion-reduce:animate-none rounded-xl bg-surface ring-1 ring-inset ring-lineSoft"
          />
        ))}
        <div
          style={{ gridColumn: '2 / span 2', gridRow: '2 / span 2' }}
          className="animate-pulse motion-reduce:animate-none rounded-xl bg-surface ring-1 ring-inset ring-lineSoft"
        />
      </div>

      {/* 解读面板骨架 —— 只在桌面端堆叠 */}
      <div className="mt-8 hidden space-y-3 md:block">
        <div className="h-4 w-32 animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-16 shrink-0 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft"
            />
          ))}
        </div>
        <div className="h-40 animate-pulse motion-reduce:animate-none rounded-xl bg-surface ring-1 ring-inset ring-lineSoft" />
      </div>

      <p className="mt-6 text-center text-2xs text-ink-3">正在排布十二宫…</p>
    </div>
  );
}
