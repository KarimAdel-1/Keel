"use client";

import { ExternalLink, Send, Sparkles, StickyNote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ReadableOutput } from "../reports/ReadableOutput";
import { Transcript, type TranscriptMessage } from "../dashboard/Transcript";
import { Notice, Spinner, timeAgo } from "../ui";

export interface TicketDetails {
  id: string;
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  conversationId?: string;
  subject: string;
  summary: string;
  status: string;
  priority: string;
  assignee?: string;
  mine: boolean;
  createdAt: string;
  contact?: { name?: string; email?: string; phone?: string };
}

export interface TicketHistory {
  id: number;
  kind: "created" | "note" | "reply" | "status" | "assign";
  author?: string;
  body: string;
  createdAt: string;
}

const HISTORY_WORD: Record<TicketHistory["kind"], string> = { created: "opened the ticket", note: "added a note", reply: "replied", status: "changed the status", assign: "changed who has it" };

/**
 * One ticket: the customer's conversation with the agent and the team, a reply (it appears in their chat) or an
 * internal note, an AI draft to start from, and the ticket's status and owner.
 */
export function TicketView({ ticket, statuses, messages, history }: { ticket: TicketDetails; statuses: { key: string; label: string; text: string }[]; messages: TranscriptMessage[]; history: TicketHistory[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"conversation" | "history">("conversation");
  const base = `/api/workspace/tickets/${ticket.id}`;

  // New customer messages arrive while the ticket is open.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(timer);
  }, [router]);

  async function patch(change: Record<string, unknown>) {
    await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
    router.refresh();
  }

  async function send() {
    setBusy("send");
    setError(null);
    const res = await fetch(`${base}/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!res.ok) return setError(body.error ?? "It couldn't be sent.");
    setText("");
    router.refresh();
  }

  async function draft() {
    setBusy("draft");
    setError(null);
    const res = await fetch(`${base}/draft`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { draft?: string; error?: string };
    setBusy(null);
    if (!res.ok || !body.draft) return setError(body.error ?? "A draft couldn't be written.");
    setMode("reply");
    setText(body.draft);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-5 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{ticket.subject}</p>
            <p className="text-xs text-muted">
              {ticket.agentName} · opened {timeAgo(ticket.createdAt)}
              {ticket.contact && ` · ${[ticket.contact.name, ticket.contact.email].filter(Boolean).join(", ")}`}
            </p>
          </div>
          <select value={ticket.status} onChange={(e) => void patch({ status: e.target.value })} className="field w-auto py-1.5 text-sm" aria-label="Status">
            {statuses.map((s) => (
              <option key={s.key} value={s.key} title={s.text}>
                {s.label}
              </option>
            ))}
          </select>
          {ticket.mine ? (
            <button type="button" onClick={() => void patch({ unassign: true })} className="btn btn-secondary px-3 py-1.5 text-xs">
              Unassign
            </button>
          ) : (
            <button type="button" onClick={() => void patch({ assignToMe: true })} className="btn btn-secondary px-3 py-1.5 text-xs">
              {ticket.assignee ? `Take from ${ticket.assignee.split(" ")[0]}` : "Assign to me"}
            </button>
          )}
          {ticket.conversationId && (
            <Link href={`/app/agents/${ticket.agentId}/activity?c=${ticket.conversationId}`} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Open in Conversations">
              <ExternalLink className="size-4" />
            </Link>
          )}
        </div>
        {ticket.summary && <div className="mt-2 rounded-lg bg-panel-2 px-3 py-2 text-sm text-muted"><ReadableOutput text={ticket.summary} label="full summary" /></div>}
      </div>
      <div className="flex gap-1 border-b border-line px-4">
        {(
          [
            ["conversation", "Conversation"],
            ["history", `Notes and history (${history.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto bg-panel-2/40 px-5 py-5">
        {tab === "conversation" ? (
          messages.length ? (
            <Transcript messages={messages} agentName={ticket.agentDisplayName} />
          ) : (
            <p className="text-center text-sm text-muted">This ticket has no chat attached.</p>
          )
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className={`rounded-xl border px-4 py-3 text-sm ${h.kind === "note" ? "border-[#fde68a] bg-[#fffbeb]" : "border-line bg-panel"}`}>
                <p className="text-xs text-muted">
                  <span className="font-medium text-ink">{h.author ?? ticket.agentDisplayName}</span> {HISTORY_WORD[h.kind]} · {timeAgo(h.createdAt)}
                </p>
                {h.body && <p className="mt-1 whitespace-pre-wrap">{h.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="border-t border-line p-4">
        <div className="mb-2 flex items-center gap-1">
          {(
            [
              ["reply", "Reply to customer", Send],
              ["note", "Internal note", StickyNote],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${mode === k ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
          <button type="button" onClick={() => void draft()} disabled={busy !== null || !ticket.conversationId} className="btn btn-ghost ml-auto px-2.5 py-1 text-xs">
            {busy === "draft" ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} Draft a reply
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className={`field resize-y ${mode === "note" ? "bg-[#fffbeb]" : ""}`}
          placeholder={mode === "reply" ? (ticket.conversationId ? "Your reply appears in the customer's chat." : "This ticket has no chat to reply in; add a note instead.") : "Only your team sees notes."}
          disabled={mode === "reply" && !ticket.conversationId}
        />
        {error && (
          <div className="mt-2">
            <Notice>{error}</Notice>
          </div>
        )}
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={() => void send()} disabled={busy !== null || !text.trim()} className="btn btn-primary">
            {busy === "send" ? <Spinner /> : mode === "reply" ? <Send className="size-4" /> : <StickyNote className="size-4" />} {mode === "reply" ? "Send reply" : "Add note"}
          </button>
        </div>
      </div>
    </div>
  );
}
