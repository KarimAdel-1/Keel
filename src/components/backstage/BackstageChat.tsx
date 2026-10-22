"use client";

import { ArrowUp, Check, Lightbulb, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { BackstageMessage, Proposal } from "@/platform/backstage";
import { RichText } from "../chat/RichText";
import { Notice, Spinner } from "../ui";

const PROMPTS = ["What should I fix first?", "Run my tests", "Improve my agent", "Run a security scan", "What do customers ask that it can't answer?", "How much does it use?"];
const KIND_WORD: Record<Proposal["kind"], string> = {
  instructions: "New instructions",
  instructions_add: "An addition to the instructions",
  rules: "A rule to add",
  fallback: "New “I don’t know” message",
  qa: "New Q&A",
  profile: "Profile, greeting and questions",
};

/**
 * Backstage: talk to Keel's Copilot about your agent in plain words. It hands each request to its specialists (the
 * analyst, the test runner, the improvement agent, the security scan, the conversation reader), shows who handled
 * it and where to follow their work; a suggested change shows as a card and is applied only when you approve it.
 */
export function BackstageChat({ agentId, agentName, initial, findings }: { agentId: string; agentName: string; initial: BackstageMessage[]; findings: string[] }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function ask(message: string) {
    if (!message.trim() || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    const temp: BackstageMessage = { id: -1 - messages.length, role: "user", content: message, proposals: [], by: [], links: [], createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    const res = await fetch(`/api/agents/${agentId}/backstage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const body = (await res.json().catch(() => ({}))) as { message?: BackstageMessage; error?: string };
    setBusy(false);
    if (!res.ok || !body.message) {
      setError(body.error ?? "The Copilot couldn't answer just now.");
      return;
    }
    const answer = await fetch(`/api/agents/${agentId}/backstage`).then((r) => r.json() as Promise<{ messages: BackstageMessage[] }>).catch(() => undefined);
    setMessages(answer?.messages ?? [...messages, temp, body.message]);
  }

  async function apply(messageId: number, index: number) {
    const res = await fetch(`/api/agents/${agentId}/backstage/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, index }) });
    if (!res.ok) return setError("That change couldn't be applied.");
    setMessages((all) => all.map((m) => (m.id === messageId ? { ...m, proposals: m.proposals.map((p, i) => (i === index ? { ...p, applied: true } : p)) } : m)));
    router.refresh();
  }

  async function clear() {
    await fetch(`/api/agents/${agentId}/backstage`, { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="card flex min-h-[520px] flex-col overflow-hidden lg:h-[calc(100dvh-9rem)]">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-md py-10 text-center">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-tint text-brand">
                <Sparkles className="size-5" />
              </span>
              <p className="mt-4 font-semibold">Ask anything about {agentName}</p>
              <p className="mt-1 text-sm text-muted">How it&apos;s doing and what to fix, or ask it to run your tests, improve the agent or scan it for attacks. Nothing changes until you apply it.</p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              {m.by.length > 0 && (
                <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  {m.by.map((who) => (
                    <span key={who} className="rounded-full border border-line bg-panel px-2 py-px">
                      {who}
                    </span>
                  ))}
                </p>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-panel"}`}>
                {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : <RichText text={m.content} />}
              </div>
              {m.links.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-3 text-xs">
                  {m.links.map((l) => (
                    <Link key={l.href} href={l.href} className="font-medium underline underline-offset-2">
                      {l.label}
                    </Link>
                  ))}
                </p>
              )}
              {m.proposals.length > 0 && (
                <div className="mt-2 w-full max-w-[85%] space-y-2">
                  {m.proposals.map((p, i) => (
                    <div key={i} className="rounded-xl border border-line bg-panel-2/50 p-4">
                      <p className="eyebrow">{KIND_WORD[p.kind]}</p>
                      <p className="mt-1 text-sm font-semibold">{p.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{p.why}</p>
                      {p.question && <p className="mt-2 text-xs font-medium">Q: {p.question}</p>}
                      <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-3 font-sans text-xs leading-relaxed">{p.value}</pre>
                      {p.applied ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-good">
                          <Check className="size-3.5" /> Applied
                        </p>
                      ) : (
                        <button type="button" onClick={() => void apply(m.id, i)} className="btn btn-primary mt-3 px-3 py-1.5 text-xs">
                          Apply this change
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <Spinner /> The Copilot is on it…
            </p>
          )}
          <div ref={end} />
        </div>
        <div className="border-t border-line p-4">
          {error && (
            <div className="mb-2">
              <Notice>{error}</Notice>
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {PROMPTS.map((p) => (
              <button key={p} type="button" onClick={() => void ask(p)} disabled={busy} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-panel-2">
                {p}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(text);
                }
              }}
              rows={2}
              className="field resize-none"
              placeholder={`Ask about ${agentName}…`}
              maxLength={4000}
            />
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary size-10 shrink-0 p-0" aria-label="Send">
              <ArrowUp className="size-4" />
            </button>
          </form>
        </div>
      </div>
      <aside className="space-y-4">
        <section className="card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-warn" /> Worth a look
          </h2>
          {findings.length ? (
            <ul className="mt-3 space-y-2.5 text-sm">
              {findings.map((f, i) => (
                <li key={i}>
                  <button type="button" onClick={() => void ask(`${f} How do I fix this?`)} disabled={busy} className="text-left text-muted hover:text-ink">
                    {f}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing stands out. Ask about anything else.</p>
          )}
        </section>
        {messages.length > 0 && (
          <button type="button" onClick={() => void clear()} className="btn btn-ghost w-full text-xs">
            <RotateCcw className="size-3.5" /> Start a new chat
          </button>
        )}
      </aside>
    </div>
  );
}
