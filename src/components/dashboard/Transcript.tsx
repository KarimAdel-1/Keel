"use client";

import { PencilLine, Zap } from "lucide-react";
import { useState } from "react";
import type { ChatWidget as Widget } from "@/core/widgets";
import { tokenCount } from "@/lib/models";
import type { ActionCall, Citation } from "@/platform/chat/answer";
import { ReadableOutput } from "../reports/ReadableOutput";

export interface TranscriptMessage {
  id: number;
  role: "user" | "assistant" | "human" | "system";
  content: string;
  createdAt: string;
  citations: Citation[];
  model?: string;
  /** Tokens the turn used; none for an answer kept from before. */
  tokens?: number;
  kept?: boolean;
  confidence?: number;
  actions?: ActionCall[];
  widgets?: Widget[];
  procedure?: string;
  /** For a team reply: who sent it. */
  author?: string;
  /** The NeMo Guardrails rail that blocked the message or reply this answers. */
  blockedBy?: string;
}

export const confidenceTone = (c: number) => (c >= 0.7 ? "bg-[#e7f6ee] text-[#087443]" : c >= 0.4 ? "bg-[#fef4e6] text-[#b54708]" : "bg-[#fdecea] text-[#c0261b]");

const WIDGET_WORD: Record<Widget["type"], string> = { form: "Form", button: "Button", cards: "Cards", tracker: "Tracker", slots: "Time slots", table: "Table", summary: "Summary" };

/**
 * A conversation as it happened: each answer with how sure the agent was, the sources it used, the actions it took,
 * the procedure it followed, the model and the tokens it used. "Revise answer" keeps a better answer for next time.
 */
export function Transcript({ messages, agentName, onRevise }: { messages: TranscriptMessage[]; agentName: string; onRevise?: (m: TranscriptMessage) => void }) {
  const [open, setOpen] = useState<{ id: number; n: number } | null>(null);
  const [openActions, setOpenActions] = useState<number | null>(null);
  return (
    <ol className="space-y-5">
      {messages.map((m) => {
        if (m.role === "system")
          return (
            <li key={m.id} className="text-center text-xs text-subtle">
              {m.content}
            </li>
          );
        const fromVisitor = m.role === "user";
        const citation = open?.id === m.id ? m.citations.find((c) => c.n === open.n) : undefined;
        const fromAgent = m.role === "assistant";
        return (
          <li key={m.id} className={`group flex flex-col ${fromVisitor ? "items-end" : "items-start"}`}>
            <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-subtle">
              {fromVisitor ? "Visitor" : m.role === "human" ? (m.author ?? "Your team") : agentName} · {new Date(m.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              {fromAgent && m.confidence !== undefined && (
                <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${confidenceTone(m.confidence)}`} title="How sure the agent was">
                  {m.confidence.toFixed(2)}
                </span>
              )}
              {fromAgent && m.procedure && <span className="rounded-full bg-panel-2 px-1.5 py-px text-[10px]">{m.procedure}</span>}
              {fromAgent && m.blockedBy && <span className="rounded-full bg-[#fdecea] px-1.5 py-px text-[10px] font-semibold text-[#c0261b]">Blocked by NeMo Guardrails ({m.blockedBy})</span>}
            </p>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] ${
                fromVisitor ? "rounded-br-md bg-brand text-brand-ink" : m.role === "human" ? "rounded-bl-md border border-line bg-panel-2" : "rounded-bl-md border border-line bg-panel"
              }`}
            >
              {fromVisitor ? <p className="whitespace-pre-wrap">{m.content}</p> : <ReadableOutput text={m.content} onCite={(n) => setOpen(open?.id === m.id && open.n === n ? null : { id: m.id, n })} />}
              {m.widgets && m.widgets.length > 0 && <p className="mt-2 text-xs text-muted">Showed: {m.widgets.map((w) => WIDGET_WORD[w.type]).join(", ")}</p>}
            </div>
            {fromAgent && (
              <div className="mt-1.5 flex max-w-[85%] flex-wrap items-center gap-1.5 text-xs text-muted">
                {m.citations.map((c) => (
                  <button
                    key={c.n}
                    type="button"
                    onClick={() => setOpen(open?.id === m.id && open.n === c.n ? null : { id: m.id, n: c.n })}
                    className={`inline-flex max-w-[220px] items-center gap-1 rounded-md border bg-panel px-1.5 py-0.5 ${citation?.n === c.n ? "border-text" : "border-line hover:border-line-strong"}`}
                  >
                    <span className="font-semibold">{c.n}</span> <span className="truncate">{c.title}</span>
                  </button>
                ))}
                {m.actions && m.actions.length > 0 && (
                  <button type="button" onClick={() => setOpenActions(openActions === m.id ? null : m.id)} className="inline-flex items-center gap-1 rounded-md border border-line bg-panel px-1.5 py-0.5 hover:border-line-strong">
                    <Zap className="size-3" /> {m.actions.map((a) => a.name).join(", ")}
                  </button>
                )}
                {m.model && (
                  <details className="text-subtle"><summary className="cursor-pointer">Response details</summary><p className="mt-1">{m.model.split("/").pop()} · {m.kept ? "answered from memory" : tokenCount(m.tokens ?? 0)}</p></details>
                )}
                {onRevise && (
                  <button type="button" onClick={() => onRevise(m)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink transition hover:bg-panel-2">
                    <PencilLine className="size-3" /> Revise answer
                  </button>
                )}
              </div>
            )}
            {citation && (
              <div className="mt-1.5 max-w-[85%] rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
                <p className="mb-1 font-medium text-text">{[citation.title, citation.section].filter(Boolean).join(" › ")}</p>
                <p className="whitespace-pre-wrap">{citation.excerpt}</p>
              </div>
            )}
            {openActions === m.id && m.actions && (
              <div className="mt-1.5 w-full max-w-[85%] space-y-2">
                {m.actions.map((a, i) => (
                  <div key={i} className="rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-[11px] leading-relaxed">
                    <p className="font-semibold">
                      {a.name} {a.error && <span className="text-bad">· {a.error}</span>}
                    </p>
                    <p className="mt-1 break-all text-muted">in: {a.arguments}</p>
                    <details className="mt-2"><summary className="cursor-pointer font-sans text-xs">View action result</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-muted">{a.result}</pre></details>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
