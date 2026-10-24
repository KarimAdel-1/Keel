"use client";

import "./globals.css";
import { useEffect } from "react";

/** The last resort, when even the page's frame failed: its own page, plainly said, with a way to try again. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="en">
      <body className="bg-panel text-ink antialiased">
        <title>Something went wrong · Keel</title>
        <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
          <p className="text-xl font-semibold tracking-[-0.03em]">
            keel<span className="text-brand">.</span>
          </p>
          <h1 className="mt-8 text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 max-w-md text-sm text-muted">Keel couldn&apos;t load this page. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} className="btn btn-primary mt-6">
            Try again
          </button>
          {error.digest && <p className="mt-6 text-xs text-subtle">Reference: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
