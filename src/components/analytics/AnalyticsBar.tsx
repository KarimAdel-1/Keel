"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice, Spinner } from "../ui";
import { ANALYTICS_RANGES } from "./period";

/** The period to look at (against the one before), and reading new conversations for topics and sentiment. */
export function AnalyticsBar({ agentId, base, range, unread, analyze = true }: { agentId: string; base: string; range: string; unread?: number; analyze?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function read() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/agents/${agentId}/analyze`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { read?: number; error?: string };
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "bad", text: body.error ?? "Conversations couldn't be read just now." });
    setMessage({ tone: "good", text: body.read ? `Read ${body.read} conversation${body.read === 1 ? "" : "s"}.` : "No new finished conversations to read." });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-0.5">
          {ANALYTICS_RANGES.map(([key, label]) => (
            <Link key={key} href={key === "30" ? base : `${base}?range=${key}`} className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === key ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </div>
        <span className="text-xs text-muted">Compared with the {ANALYTICS_RANGES.find(([k]) => k === range)?.[1]} before. Website, chat page and API only.</span>
        {analyze && (
          <button type="button" onClick={() => void read()} disabled={busy} className="btn btn-secondary ml-auto" title="A fast model reads each finished conversation for its topic and how the customer felt">
            {busy ? <Spinner /> : <Sparkles className="size-4" />} Analyze conversations{unread ? ` (${unread} new)` : ""}
          </button>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
