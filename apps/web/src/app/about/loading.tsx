export default function AboutLoading() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-10 space-y-3">
        <div className="h-3 w-16 animate-pulse rounded bg-lineSoft" />
        <div className="h-8 w-48 max-w-full animate-pulse rounded bg-lineSoft" />
        <div className="h-14 w-full animate-pulse rounded bg-lineSoft" />
      </div>
      <div className="space-y-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-t border-line pt-8 space-y-3">
            <div className="h-4 w-28 animate-pulse rounded bg-lineSoft" />
            <div className="h-24 w-full animate-pulse rounded bg-lineSoft" />
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-2xs text-ink-3">正在加载口径说明…</p>
    </div>
  );
}
