"use client";

import { Download, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { RANGES, SHOWS, SOURCES } from "./filters";

/** The filters above the conversations list, kept in the address so a filtered view can be shared or reloaded. */
export function ConversationFilters({ agentId, range, source, show, q }: { agentId: string; range: string; source: string; show: string; q: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(q);

  function go(change: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    next.delete("c");
    for (const [k, v] of Object.entries(change)) {
      if (!v || v === "all" || (k === "range" && v === "30")) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    router.push(s ? `${path}?${s}` : path);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: text.trim() });
        }}
        className="relative min-w-[220px] flex-1"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search messages" className="field pl-9" />
      </form>
      <select value={range} onChange={(e) => go({ range: e.target.value })} className="field w-auto" aria-label="Dates">
        {RANGES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select value={source} onChange={(e) => go({ source: e.target.value })} className="field w-auto" aria-label="Source">
        {SOURCES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select value={show} onChange={(e) => go({ show: e.target.value })} className="field w-auto" aria-label="Show">
        {SHOWS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <a href={`/api/agents/${agentId}/export?kind=conversations`} className="btn btn-secondary">
        <Download className="size-4" /> Export
      </a>
    </div>
  );
}
