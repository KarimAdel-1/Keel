"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Wordmark } from "@/components/Wordmark";

/** A page of the website or a chat page that failed to load: said plainly, with a way to try again. */
export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-panel px-4 py-16 text-center">
      <Wordmark />
      <h1 className="mt-8 text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">This page couldn&apos;t load just now. Please try again in a moment.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Home page
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-subtle">Reference: {error.digest}</p>}
    </div>
  );
}
