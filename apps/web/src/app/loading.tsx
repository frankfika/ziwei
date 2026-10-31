export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16" role="status" aria-busy="true" aria-live="polite">
      <div className="mb-12 max-w-2xl space-y-3">
        <div className="h-3 w-28 animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="h-9 w-64 max-w-full animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
        <div className="h-16 w-full animate-pulse motion-reduce:animate-none rounded bg-lineSoft" />
      </div>
      <div className="h-80 animate-pulse motion-reduce:animate-none rounded-xl border border-line bg-surface" />
      <p className="mt-6 text-center text-2xs text-ink-3">页面加载中…</p>
    </div>
  );
}
