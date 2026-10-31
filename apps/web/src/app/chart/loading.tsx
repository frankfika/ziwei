export default function ChartLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-8 border-b border-line pb-6">
        <div className="h-3 w-24 animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="mt-3 h-8 w-72 max-w-full animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="mt-3 h-3 w-56 max-w-full animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="mt-4 flex gap-2">
          <div className="h-9 w-24 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft" />
          <div className="h-9 w-24 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft" />
        </div>
      </div>

      {/* Desktop 4×4 board skeleton (center 2×2) */}
      <div
        className="mb-14 hidden gap-px overflow-hidden rounded-xl border border-line bg-line md:grid"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(4, minmax(10.5rem, auto))',
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`r1-${i}`}
            className="animate-pulse motion-reduce:animate-none bg-surface"
          />
        ))}
        <div className="animate-pulse motion-reduce:animate-none bg-surface" />
        <div
          className="col-span-2 row-span-2 animate-pulse motion-reduce:animate-none bg-surface"
          aria-hidden="true"
        />
        <div className="animate-pulse motion-reduce:animate-none bg-surface" />
        <div className="animate-pulse motion-reduce:animate-none bg-surface" />
        <div className="animate-pulse motion-reduce:animate-none bg-surface" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`r4-${i}`}
            className="animate-pulse motion-reduce:animate-none bg-surface"
          />
        ))}
      </div>

      {/* Mobile list skeleton */}
      <div className="mb-14 space-y-2 md:hidden">
        <div className="h-28 animate-pulse motion-reduce:animate-none rounded-xl border border-line bg-surface" />
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse motion-reduce:animate-none rounded-full bg-lineSoft" />
          <div className="h-9 w-20 animate-pulse motion-reduce:animate-none rounded-full bg-lineSoft" />
          <div className="h-9 w-24 animate-pulse motion-reduce:animate-none rounded-full bg-lineSoft" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse motion-reduce:animate-none rounded-xl border border-line bg-surface"
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-16 shrink-0 animate-pulse motion-reduce:animate-none rounded-lg bg-lineSoft"
            />
          ))}
        </div>
        <div className="h-40 animate-pulse motion-reduce:animate-none rounded-xl border border-line bg-surface" />
      </div>
      <p className="mt-6 text-center text-2xs text-ink-3">正在排盘与检索解读…</p>
    </div>
  );
}
