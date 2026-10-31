export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16" aria-busy="true">
      <div className="mb-12 max-w-2xl space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-lineSoft" />
        <div className="h-9 w-64 max-w-full animate-pulse rounded bg-lineSoft" />
        <div className="h-16 w-full animate-pulse rounded bg-lineSoft" />
      </div>
      <div className="h-80 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
