"use client";

import { Play, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "../Dialog";
import { Transcript, type TranscriptMessage } from "../dashboard/Transcript";
import { Notice, Pill } from "../ui";
import { tokenCount } from "@/lib/models";

export interface ConversationDetails {
  id: string;
  title: string;
  source: string;
  status: "open" | "handed_off" | "closed" | "paused";
  startedAt: string;
  lastAt: string;
  messages: number;
  tokens: number;
  country?: string;
  sentiment?: string;
  topic?: string;
  contact?: { id: string; name?: string; email?: string; phone?: string };
  tickets: { id: string; subject: string; status: string }[];
}

const STATUS: Record<ConversationDetails["status"], { label: string; tone: "neutral" | "good" | "warn" | "bad" | "brand" }> = {
  open: { label: "Agent answering", tone: "good" },
  handed_off: { label: "With your team", tone: "brand" },
  closed: { label: "Closed", tone: "neutral" },
  paused: { label: "Paused as spam", tone: "bad" },
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** One conversation: the chat as it happened, or its details (who, where, how it felt, tickets it opened). */
export function ConversationView({ agentId, agentName, details, messages }: { agentId: string; agentName: string; details: ConversationDetails; messages: TranscriptMessage[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"chat" | "details">("chat");
  const [revising, setRevising] = useState<TranscriptMessage | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function resume() {
    await fetch(`/api/agents/${agentId}/conversations/${details.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "open" }) });
    router.refresh();
  }

  async function remove() {
    await fetch(`/api/agents/${agentId}/conversations/${details.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    router.push(`/app/agents/${agentId}/activity`);
    router.refresh();
  }

  const question = (m: TranscriptMessage) => {
    const at = messages.findIndex((x) => x.id === m.id);
    return [...messages.slice(0, at)].reverse().find((x) => x.role === "user")?.content ?? "";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{details.title}</p>
          <p className="text-xs text-muted">
            {details.source} · {when(details.startedAt)} · {details.messages} messages
          </p>
        </div>
        <Pill tone={STATUS[details.status].tone}>{STATUS[details.status].label}</Pill>
        {details.status === "paused" && (
          <button type="button" onClick={() => void resume()} className="btn btn-secondary px-2.5 py-1.5 text-xs">
            <Play className="size-3.5" /> Resume
          </button>
        )}
        <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete conversation">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex gap-1 border-b border-line px-4">
        {(["chat", "details"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium capitalize ${tab === t ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
      {notice && (
        <div className="px-5 pt-3">
          <Notice tone="good">{notice}</Notice>
        </div>
      )}
      {tab === "chat" ? (
        <div className="flex-1 overflow-y-auto bg-panel-2/40 px-5 py-5">
          <Transcript messages={messages} agentName={agentName} onRevise={setRevising} />
        </div>
      ) : (
        <dl className="flex-1 divide-y divide-line overflow-y-auto px-5 text-sm">
          {(
            [
              ["Source", details.source],
              ["Started", when(details.startedAt)],
              ["Last message", when(details.lastAt)],
              ["Messages", String(details.messages)],
              ["Model use", tokenCount(details.tokens)],
              ["Country", details.country ?? "Unknown"],
              ["Topic", details.topic ?? "Not read yet"],
              ["Sentiment", details.sentiment ? details.sentiment[0].toUpperCase() + details.sentiment.slice(1) : "Not read yet"],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="text-muted">Contact</dt>
            <dd className="min-w-0 break-words">
              {details.contact ? (
                <Link href={`/app/agents/${agentId}/contacts?q=${encodeURIComponent(details.contact.email ?? details.contact.name ?? "")}`} className="underline underline-offset-2">
                  {[details.contact.name, details.contact.email, details.contact.phone].filter(Boolean).join(" · ")}
                </Link>
              ) : (
                <span className="text-muted">They didn&apos;t leave their details</span>
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
            <dt className="text-muted">Tickets</dt>
            <dd className="space-y-1">
              {details.tickets.length ? (
                details.tickets.map((t) => (
                  <Link key={t.id} href={`/app/helpdesk?t=${t.id}`} className="block underline underline-offset-2">
                    {t.subject} <span className="text-muted">({t.status})</span>
                  </Link>
                ))
              ) : (
                <span className="text-muted">None</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      {revising && (
        <ReviseDialog
          agentId={agentId}
          conversationId={details.id}
          message={revising}
          question={question(revising)}
          onClose={() => setRevising(null)}
          onDone={() => {
            setRevising(null);
            setNotice("Saved as a Q&A in What it knows. The agent answers this way from now on.");
          }}
        />
      )}
      {confirmDelete && (
        <Dialog
          title="Delete this conversation?"
          subtitle="Its messages are deleted for good. Leads and tickets it created stay."
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={() => void remove()} className="btn btn-danger">Delete</button>
            </>
          }
        >
          <p className="text-sm text-muted">{details.title}</p>
        </Dialog>
      )}
    </div>
  );
}

function ReviseDialog({ agentId, conversationId, message, question: asked, onClose, onDone }: { agentId: string; conversationId: string; message: TranscriptMessage; question: string; onClose: () => void; onDone: () => void }) {
  const [question, setQuestion] = useState(asked);
  const [answer, setAnswer] = useState(message.content.replace(/\s*\[\d+\]/g, ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/agents/${agentId}/conversations/${conversationId}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: message.id, question, answer }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "It couldn't be saved.");
    onDone();
  }

  return (
    <Dialog
      title="Revise answer"
      subtitle="Write the answer it should have given. It's kept as a Q&A, so the agent answers this question that way next time."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save answer"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Customer&apos;s question</span>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="field" maxLength={500} />
        </label>
        <label className="block">
          <span className="label">The right answer</span>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} className="field resize-y" maxLength={10_000} />
        </label>
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
