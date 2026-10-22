"use client";

import { Check, ExternalLink } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { ChatWidget as Widget, FieldSpec } from "@/core/widgets";

/** A rich reply in the chat: a form, a button, cards, a tracker, time slots, a table or a summary. */
export function ChatWidget({ widget, agentId, conversationId, onSend }: { widget: Widget; agentId: string; conversationId?: string; onSend: (text: string) => void }) {
  switch (widget.type) {
    case "form":
      return <FormWidget widget={widget} agentId={agentId} conversationId={conversationId} />;
    case "button":
      return (
        <a href={widget.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[var(--c-accent)] px-4 py-2 text-sm font-medium text-[var(--c-accent-ink)]">
          {widget.label} <ExternalLink className="size-3.5" />
        </a>
      );
    case "cards":
      return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {widget.items.map((item, i) => (
            <div key={i} className="w-44 shrink-0 overflow-hidden rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)]">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" className="h-24 w-full object-cover" />
              ) : (
                <div className="h-16 bg-[var(--c-line)]" />
              )}
              <div className="space-y-0.5 p-2.5 text-xs">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                {item.subtitle && <p className="line-clamp-2 text-[var(--c-muted)]">{item.subtitle}</p>}
                {item.price && <p className="font-semibold">{item.price}</p>}
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline">
                    View <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    case "tracker":
      return (
        <div className="rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] p-3 text-xs">
          {widget.title && <p className="mb-2 text-sm font-semibold">{widget.title}</p>}
          <ol className="space-y-2">
            {widget.steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={`inline-flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${i <= widget.current ? "bg-[var(--c-accent)] text-[var(--c-accent-ink)]" : "border border-[var(--c-line)] text-[var(--c-muted)]"}`}>
                  {i < widget.current ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={i === widget.current ? "font-semibold" : i > widget.current ? "text-[var(--c-muted)]" : ""}>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "slots":
      return (
        <div>
          {widget.title && <p className="mb-1.5 text-xs text-[var(--c-muted)]">{widget.title}</p>}
          <div className="flex flex-wrap gap-1.5">
            {widget.options.map((o) => (
              <button key={o} type="button" onClick={() => onSend(o)} className="rounded-lg border border-[var(--c-accent)] px-3 py-1.5 text-xs font-medium text-[var(--c-accent)] hover:bg-[var(--c-accent)] hover:text-[var(--c-accent-ink)]">
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--c-line)]">
                {widget.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {widget.rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--c-line)] last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "summary":
      return (
        <div className="rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] p-3 text-xs">
          {widget.title && <p className="mb-2 text-sm font-semibold">{widget.title}</p>}
          <dl className="space-y-1">
            {widget.rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-4">
                <dt className="text-[var(--c-muted)]">{r.label}</dt>
                <dd className="text-right font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
  }
}

function inputFor(field: FieldSpec, value: string, onChange: (v: string) => void) {
  const common = "w-full rounded-lg border border-[var(--c-line)] bg-[var(--c-input-bg)] px-2.5 py-1.5 text-sm text-[var(--c-text)] outline-none focus:border-[var(--c-accent)]";
  if (field.type === "long") return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={common} required={field.required} />;
  if (field.type === "choice")
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={common} required={field.required}>
        <option value="">Choose…</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  const type = field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={common} required={field.required} />;
}

function FormWidget({ widget, agentId, conversationId }: { widget: Extract<Widget, { type: "form" }>; agentId: string; conversationId?: string }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<"open" | "sending" | "sent">("open");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch(`/api/chat/${agentId}/forms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, actionId: widget.actionId, answers }) }).catch(() => undefined);
    if (res?.ok) return setState("sent");
    setState("open");
    setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "It didn't send. Please try again.");
  }

  if (state === "sent")
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] px-3 py-2.5 text-sm">
        <Check className="size-4 text-[#087443]" /> Thanks, we&apos;ve got your details.
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-2.5 rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] p-3">
      <p className="text-sm font-semibold">{widget.title}</p>
      {widget.fields.map((f) => (
        <label key={f.key} className="block text-xs">
          <span className="mb-1 block text-[var(--c-muted)]">
            {f.label}
            {f.required ? "" : " (optional)"}
          </span>
          {inputFor(f, answers[f.key] ?? "", (v) => setAnswers({ ...answers, [f.key]: v }))}
        </label>
      ))}
      {error && <p className="text-xs text-[#b42318]">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="w-full rounded-lg bg-[var(--c-accent)] py-2 text-sm font-medium text-[var(--c-accent-ink)] disabled:opacity-60">
        {state === "sending" ? "Sending…" : widget.submitLabel}
      </button>
    </form>
  );
}
