export default function ChartLoading() {
  return (
    <div
      className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-8 border-b border-line pb-6">
        <div className="h-3 w-24 animate-pulse rounded bg-lineSoft" />
        <div className="mt-3 h-8 w-72 max-w-full animate-pulse rounded bg-lineSoft" />
        <div className="mt-3 h-3 w-56 max-w-full animate-pulse rounded bg-lineSoft" />
      </div>
      <div className="mb-14 h-64 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-lineSoft" />
        <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
      </div>
      <p className="mt-6 text-center text-2xs text-ink-3">正在排盘与检索解读…</p>
    </div>
  );
}
