"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const key = (agentId: string) => `keel-start-here:${agentId}`;

/**
 * The first time someone opens an agent's Try it page: what to do here, and where to go next, in three lines. Closed
 * once, it stays closed in that browser.
 */
export function StartHere({ agentId }: { agentId: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(key(agentId)) === "closed";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's memory is only readable after mounting
    if (!seen) setShown(true);
  }, [agentId]);
  if (!shown) return null;
  const close = () => {
    try {
      localStorage.setItem(key(agentId), "closed");
    } catch {}
    setShown(false);
  };
  const base = `/app/agents/${agentId}`;
  return (
    <div className="relative mx-5 mt-5 rounded-xl border border-brand/30 bg-brand-tint/50 p-4 pr-10 text-sm">
      <button type="button" onClick={close} aria-label="Close the guide" className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted hover:bg-panel hover:text-text">
        <X className="size-4" />
      </button>
      <p className="font-semibold">Start here</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[13px] leading-snug text-muted">
        <li>
          <span className="text-text">Ask the chat anything</span>, or tap a suggested question. Each answer shows its source, and the Nemotron model that wrote it.
        </li>
        <li>
          See it checked: <Link href={`${base}/tests`} className="font-medium text-brand hover:underline">Tests</Link> (AI customers, every fact judged) and{" "}
          <Link href={`${base}/quality`} className="font-medium text-brand hover:underline">Quality</Link> (answers graded blind).
        </li>
        <li>
          <Link href={`${base}/getting-started`} className="font-medium text-brand hover:underline">Home</Link> shows what it does for customers and what&apos;s left to do.
        </li>
      </ol>
    </div>
  );
}
