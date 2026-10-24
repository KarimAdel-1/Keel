import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = { title: "Page not found" };

/** A link that leads nowhere: said plainly, with the two places people usually want. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-panel px-4 py-16 text-center">
      <Wordmark />
      <p className="mt-8 text-sm font-medium text-brand">404</p>
      <h1 className="mt-2 text-2xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="mt-2 max-w-md text-sm text-muted">The link may be old, or mistyped.</p>
      <div className="mt-6 flex justify-center gap-2">
        <Link href="/" className="btn btn-secondary">
          Home page
        </Link>
        <Link href="/app" className="btn btn-primary">
          Your dashboard
        </Link>
      </div>
    </div>
  );
}
