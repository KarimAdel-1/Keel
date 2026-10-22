"use client";

import { Columns2, Cpu, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Agent, AgentModel } from "@/core/agents";
import { industryDefaults } from "@/core/industries";
import { AUTO_BLURB, MODEL_KEYS, MODELS, tokenCount } from "@/lib/models";
import type { Citation } from "@/platform/chat/answer";
import { RichText } from "../chat/RichText";
import { Dialog } from "../Dialog";
import { TestChange } from "../improve/TestChange";
import { PageBar, PageBody } from "../shell/PageBar";
import { Notice, Spinner, Toggle } from "../ui";
import { useDraft } from "./useDraft";

const creativityWord = (t: number) => (t <= 0.2 ? "Steady" : t <= 0.6 ? "Balanced" : "Varied");

type Fields = {
  instructions: string;
  guardrails: string;
  knowledgeOnly: boolean;
  fallback: string;
  model: AgentModel;
  temperature: number;
  summary: string;
  offerings: string;
  audience: string;
  tone: string;
};

/** The editor's fields as the agent's settings: the profile's fields go into its profile. */
function toConfig(d: Fields) {
  const { summary, offerings, audience, tone, ...rest } = d;
  return {
    ...rest,
    profile: { summary: summary.trim(), offerings: offerings.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 12), audience: audience.trim(), tone: tone.trim() },
  };
}

function Card({ title, text, aside, children, id }: { title: string; text?: string; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-line pb-7 last:border-b-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {text && <p className="mt-0.5 text-sm text-muted">{text}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Build › Instructions: what the agent knows about the business, what it does, the rules it always follows and what
 * it says when it doesn't know, with the model and its creativity beside them. Compare runs one question through two
 * versions side by side before saving.
 */
export function InstructionsEditor({ agent }: { agent: Agent }) {
  const c = agent.config;
  const saved: Fields = {
    instructions: c.instructions,
    guardrails: c.guardrails,
    knowledgeOnly: c.knowledgeOnly,
    fallback: c.fallback,
    model: c.model,
    temperature: c.temperature,
    summary: c.profile.summary,
    offerings: c.profile.offerings.join("\n"),
    audience: c.profile.audience,
    tone: c.profile.tone,
  };
  const { draft, set, dirty, saving, error, save, discard } = useDraft(agent.id, saved, (d) => ({ config: toConfig(d) }));
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const example = industryDefaults(c.industry, agent.name).instructions;

  async function redraft() {
    setDrafting(true);
    setDraftError(null);
    const res = await fetch(`/api/agents/${agent.id}/profile`, { method: "POST" }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { draft?: { summary: string; offerings: string[]; audience: string; tone: string }; error?: string };
    setDrafting(false);
    if (!res?.ok || !body.draft) return setDraftError(body.error ?? "Keel couldn't write a draft just now. Try again in a moment.");
    set({ summary: body.draft.summary, offerings: body.draft.offerings.join("\n"), audience: body.draft.audience, tone: body.draft.tone });
  }

  return (
    <>
      <PageBar
        title="How it behaves"
        actions={
          <>
            <button type="button" onClick={() => setComparing(true)} className="btn btn-secondary">
              <Columns2 className="size-4" /> Compare
            </button>
            {dirty && (
              <button type="button" onClick={discard} disabled={saving} className="btn btn-ghost">
                Discard
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      />
      <PageBody wide>
        {error && <Notice>{error}</Notice>}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 space-y-7">
            <Card
              id="about"
              title="About your business"
              text="What the agent keeps in mind for every answer."
              aside={
                <button type="button" onClick={() => void redraft()} disabled={drafting} className="btn btn-secondary shrink-0 px-2.5 py-1.5 text-xs">
                  {drafting ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {draft.summary ? "Draft again" : "Draft it for me"}
                </button>
              }
            >
              <div className="space-y-4">
                <label className="block">
                  <span className="label">What you do</span>
                  <textarea value={draft.summary} onChange={(e) => set({ summary: e.target.value })} rows={3} className="field resize-y" maxLength={1500} />
                </label>
                <label className="block">
                  <span className="label">What you offer</span>
                  <textarea value={draft.offerings} onChange={(e) => set({ offerings: e.target.value })} rows={3} className="field resize-y" placeholder="One per line" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="label">Your customers</span>
                    <input value={draft.audience} onChange={(e) => set({ audience: e.target.value })} className="field" maxLength={500} />
                  </label>
                  <label className="block">
                    <span className="label">How you talk to them</span>
                    <input value={draft.tone} onChange={(e) => set({ tone: e.target.value })} className="field" maxLength={300} />
                  </label>
                </div>
                {draftError && <Notice>{draftError}</Notice>}
              </div>
            </Card>

            <Card
              title="General"
              text="The agent's job and tone, as you'd brief a new team member. Its language rules and formatting go here too."
              aside={
                draft.instructions !== example && (
                  <button type="button" onClick={() => set({ instructions: example })} className="btn btn-ghost shrink-0 px-2.5 py-1.5 text-xs">
                    Use the example
                  </button>
                )
              }
            >
              <textarea value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={10} className="field resize-y leading-relaxed" maxLength={8000} aria-label="General instructions" />
            </Card>

            <Card title="Rules it always follows" text="Whatever anyone asks: what it never reveals, topics it stays away from, what it never promises.">
              <textarea value={draft.guardrails} onChange={(e) => set({ guardrails: e.target.value })} rows={6} className="field resize-y leading-relaxed" maxLength={4000} aria-label="Rules" />
            </Card>

            <Card title="When it doesn't know">
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm">
                  <span className="block font-medium">Answer only from what it knows (recommended)</span>
                  <span className="text-muted">It never guesses about your business. Turn off to let it answer general questions too.</span>
                </span>
                <Toggle checked={draft.knowledgeOnly} onChange={(knowledgeOnly) => set({ knowledgeOnly })} label="Answer only from what it knows" />
              </div>
              {draft.knowledgeOnly && (
                <label className="mt-4 block">
                  <span className="label">It says</span>
                  <textarea value={draft.fallback} onChange={(e) => set({ fallback: e.target.value })} rows={2} className="field resize-y" maxLength={500} />
                </label>
              )}
            </Card>
          </div>

          <aside className="xl:sticky xl:top-20 xl:self-start">
            <div className="rounded-2xl bg-panel-2/70 p-4">
              <h2 className="text-[15px] font-semibold">How it thinks</h2>
              <div className="mt-3 rounded-xl border border-line bg-panel p-4">
                <span className="label">Speed and care</span>
                <div className="relative">
                  <Cpu className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <select value={draft.model} onChange={(e) => set({ model: e.target.value as AgentModel })} className="field appearance-none pl-9">
                    {MODEL_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {MODELS[k].plain} · {MODELS[k].name}
                      </option>
                    ))}
                    <option value="auto">Automatic: fast when it can be (lower cost)</option>
                  </select>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {draft.model === "auto" ? AUTO_BLURB : MODELS[draft.model].blurb}
                </p>
              </div>
              <div className="mt-4 px-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Wording</span>
                  <span className="text-xs text-muted">{creativityWord(draft.temperature)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.1} value={draft.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} className="mt-3 w-full accent-[var(--ink)]" aria-label="Wording" />
                <div className="flex justify-between text-[11px] text-subtle">
                  <span>Same careful answer</span>
                  <span>More varied wording</span>
                </div>
              </div>
            </div>
            {dirty && (
              <div className="mt-3 space-y-2 px-1">
                <p className="text-xs text-muted">Unsaved changes. Compare tries one question; Test this change runs your tests on both versions.</p>
                <TestChange agentId={agent.id} change={toConfig(draft)} />
              </div>
            )}
          </aside>
        </div>
      </PageBody>
      {comparing && <CompareDialog agentId={agent.id} saved={toConfig(saved)} draft={toConfig(draft)} onClose={() => setComparing(false)} />}
    </>
  );
}

type Side = { text: string; citations: Citation[]; model: string; tokens: number; confidence: number; actions: string[] };
type Config = ReturnType<typeof toConfig>;

/** One question, answered by the saved settings and by the edited ones (or by another model), side by side. */
function CompareDialog({ agentId, saved, draft, onClose }: { agentId: string; saved: Config; draft: Config; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [modelA, setModelA] = useState<AgentModel>(saved.model);
  const [modelB, setModelB] = useState<AgentModel>(draft.model);
  const [result, setResult] = useState<{ a: Side; b: Side } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, a: { ...saved, model: modelA }, b: { ...draft, model: modelB } }),
    }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { a?: Side; b?: Side; error?: string };
    setBusy(false);
    if (!res?.ok || !body.a || !body.b) return setError(body.error ?? "The comparison didn't run. Try again.");
    setResult({ a: body.a, b: body.b });
  }

  const column = (label: string, model: AgentModel, setModel: (m: AgentModel) => void, side?: Side) => (
    <div className="flex min-w-0 flex-col rounded-xl border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-sm font-semibold">{label}</span>
        <select value={model} onChange={(e) => setModel(e.target.value as AgentModel)} className="rounded-md border border-line bg-panel px-2 py-1 text-xs">
          {MODEL_KEYS.map((k) => (
            <option key={k} value={k}>
              {MODELS[k].name}
            </option>
          ))}
          <option value="auto">Automatic</option>
        </select>
      </div>
      <div className="min-h-40 flex-1 px-3 py-3 text-sm leading-relaxed">
        {side ? (
          <>
            <RichText text={side.text} />
            <p className="mt-3 text-[11px] text-subtle">
              {side.model} · {tokenCount(side.tokens)} · confidence {side.confidence.toFixed(2)}
              {side.citations.length ? ` · from ${side.citations.map((c) => c.title).join(", ")}` : ""}
              {side.actions.length ? ` · called ${side.actions.join(", ")}` : ""}
            </p>
          </>
        ) : (
          <span className="text-subtle">{busy ? "Answering…" : "The answer appears here."}</span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog title="Compare" subtitle="Ask one question and see how two versions answer it. Nothing is saved, and no conversation is kept." onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
        className="flex gap-2"
      >
        <input value={message} onChange={(e) => setMessage(e.target.value)} className="field" placeholder="A question your customers ask…" autoFocus />
        <button type="submit" disabled={busy || !message.trim()} className="btn btn-primary shrink-0">
          {busy && <Spinner />} Compare
        </button>
      </form>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {column("Saved", modelA, setModelA, result?.a)}
        {column("With your changes", modelB, setModelB, result?.b)}
      </div>
    </Dialog>
  );
}
