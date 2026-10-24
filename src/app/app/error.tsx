"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/** A dashboard page that failed to load: said plainly, with a way to try again; the sidebar stays. */
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto inline-flex size-11 items-center justify-center rounded-xl bg-[#fdecec] text-[#b42318]">
          <AlertTriangle className="size-5" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">This page didn&apos;t load</h1>
        <p className="mt-2 text-sm text-muted">Something went wrong on our side. Your agents, their settings and their conversations are safe. Try again, or go back to your agents.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => retry()} className="btn btn-primary">
            Try again
          </button>
          <Link href="/app" className="btn btn-secondary">
            Your agents
          </Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-subtle">Reference: {error.digest}</p>}
      </div>
    </div>
  );
}
