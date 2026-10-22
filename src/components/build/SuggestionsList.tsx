"use client";

import { Lightbulb, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Suggestion } from "@/platform/suggestions";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, Pill, Spinner, timeAgo } from "../ui";

const SEVERITY: Record<Suggestion["severity"], { label: string; tone: "bad" | "warn" | "neutral" }> = {
  3: { label: "Critical", tone: "bad" },
  2: { label: "Important", tone: "warn" },
  1: { label: "Minor", tone: "neutral" },
};
type View = "open" | "resolved" | "dismissed";

/**
 * Build › Suggestions: where the knowledge lets customers down. Questions nothing answered (write the answer once and
 * it becomes a Q&A) and sources that say different things about the same subject.
 */
export function SuggestionsList({ agentId, initial }: { agentId: string; initial: Suggestion[] }) {
  const [all, setAll] = useState(initial);
  const [view, setView] = useState<View>("open");
  const [kind, setKind] = useState<"all" | "gap" | "conflict">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [answering, setAnswering] = useState<Suggestion | null>(null);
  const shown = all.filter((s) => s.status === view && (kind === "all" || s.kind === kind));
  const count = (v: View) => all.filter((s) => s.status === v).length;

  async function refresh() {
    setRefreshing(true);
    const res = await fetch(`/api/agents/${agentId}/suggestions/refresh`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { suggestions?: Suggestion[] };
    setRefreshing(false);
    if (body.suggestions) setAll(body.suggestions);
  }

  async function setStatus(s: Suggestion, status: View) {
    setAll((list) => list.map((x) => (x.id === s.id ? { ...x, status } : x)));
    await fetch(`/api/agents/${agentId}/suggestions/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line bg-panel-2 p-0.5">
          {(["open", "resolved", "dismissed"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${view === v ? "bg-panel text-ink shadow-sm" : "text-muted"}`}>
              {v === "open" ? "To review" : v} <span className="text-muted">{count(v)}</span>
            </button>
          ))}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="field w-auto py-1.5">
          <option value="all">All kinds</option>
          <option value="gap">Unanswered questions</option>
          <option value="conflict">Conflicting sources</option>
        </select>
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="btn btn-secondary ml-auto">
          {refreshing ? <Spinner /> : <RefreshCw className="size-4" />} Look again
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-5" />}
          title={view === "open" ? "Nothing to fix right now" : `Nothing ${view}`}
          text={view === "open" ? "When customers ask something the knowledge doesn't cover, or two sources disagree, it shows up here." : "Suggestions you handle move here."}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <li key={s.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={SEVERITY[s.severity].tone}>{SEVERITY[s.severity].label}</Pill>
                <Pill>{s.kind === "gap" ? "Unanswered question" : "Conflicting sources"}</Pill>
                <span className="ml-auto text-xs text-muted">{timeAgo(s.updatedAt)}</span>
              </div>
              <p className="mt-3 text-[15px] font-semibold">{s.title}</p>
              {s.kind === "gap" && s.detail.questions && (
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {s.detail.questions.slice(0, 4).map((q, i) => (
                    <li key={i}>“{q}”</li>
                  ))}
                  {s.detail.questions.length > 4 && <li>and {s.detail.questions.length - 4} more</li>}
                </ul>
              )}
              {s.kind === "conflict" && (
                <div className="mt-3 space-y-2">
                  {s.detail.explanation && <p className="text-sm">{s.detail.explanation}</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {s.detail.passages?.map((p, i) => (
                      <div key={i} className="rounded-lg border border-line bg-panel-2/50 p-3 text-xs">
                        <p className="font-semibold">{p.title}</p>
                        <p className="mt-1 line-clamp-4 text-muted">{p.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {s.status === "open" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.kind === "gap" ? (
                    <button type="button" onClick={() => setAnswering(s)} className="btn btn-primary px-3 py-1.5 text-xs">
                      Write the answer
                    </button>
                  ) : (
                    <Link href={`/app/agents/${agentId}/sources`} className="btn btn-primary px-3 py-1.5 text-xs">
                      Fix in What it knows
                    </Link>
                  )}
                  {s.kind === "conflict" && (
                    <button type="button" onClick={() => void setStatus(s, "resolved")} className="btn btn-secondary px-3 py-1.5 text-xs">
                      Mark fixed
                    </button>
                  )}
                  {s.detail.conversationIds?.[0] && (
                    <Link href={`/app/agents/${agentId}/activity?c=${s.detail.conversationIds[0]}`} className="btn btn-secondary px-3 py-1.5 text-xs">
                      See the conversation
                    </Link>
                  )}
                  <button type="button" onClick={() => void setStatus(s, "dismissed")} className="btn btn-ghost px-3 py-1.5 text-xs">
                    Dismiss
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void setStatus(s, "open")} className="btn btn-ghost mt-3 px-3 py-1.5 text-xs">
                  Move back to review
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {answering && (
        <AnswerDialog
          agentId={agentId}
          suggestion={answering}
          onClose={() => setAnswering(null)}
          onDone={() => {
            setAll((list) => list.map((x) => (x.id === answering.id ? { ...x, status: "resolved" } : x)));
            setAnswering(null);
          }}
        />
      )}
    </div>
  );
}

function AnswerDialog({ agentId, suggestion, onClose, onDone }: { agentId: string; suggestion: Suggestion; onClose: () => void; onDone: () => void }) {
  const [question, setQuestion] = useState(suggestion.detail.questions?.[0] ?? suggestion.title);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/agents/${agentId}/suggestions/${suggestion.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, answer }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "It couldn't be saved.");
    onDone();
  }

  return (
    <Dialog
      title="Write the answer"
      subtitle="It's added to the knowledge as a Q&A, so the agent answers this from now on."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving || answer.trim().length < 2} className="btn btn-primary">{saving ? "Adding…" : "Add to knowledge"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Question</span>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} className="field" maxLength={500} />
        </label>
        <label className="block">
          <span className="label">Answer</span>
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} className="field resize-y" maxLength={10_000} autoFocus />
        </label>
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
