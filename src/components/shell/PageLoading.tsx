import { Spinner } from "../ui";

/**
 * A dashboard page while it loads: the shape of a page (its bar, a row of cards, a list), so the owner sees at once
 * that the click worked. Screen readers hear "Loading…".
 */
export function PageLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="sticky top-14 z-20 border-b border-line bg-panel lg:top-0">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <span className="size-8 animate-pulse rounded-lg bg-panel-2" />
          <span className="h-5 w-40 animate-pulse rounded bg-panel-2" />
          <Spinner className="ml-auto size-4 text-muted" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-6 sm:px-6" aria-hidden>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-panel" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-line bg-panel p-5">
          {[72, 88, 64, 80, 56].map((width, i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-panel-2" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
