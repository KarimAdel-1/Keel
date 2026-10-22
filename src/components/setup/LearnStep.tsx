"use client";

import { ArrowRight, Check, CircleAlert, Clock, FileText, Globe, MessageCircleQuestion, Plus, Sparkles, Type, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { INDUSTRIES, type Agent, type Brand, type Industry, type Source } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { BrandPicker } from "../channel/BrandPicker";
import { ChatWindow } from "../chat/ChatWindow";
import { lookOf } from "../chat/look";
import { FilesForm, WebsiteForm, type Knowledge } from "../knowledge/KnowledgeEditor";
import { Notice, Spinner } from "../ui";

type Phase = "reading" | "drafting" | "review" | "failed";

interface Review {
  name: string;
  industry: Industry;
  summary: string;
  offerings: string;
  audience: string;
  tone: string;
  instructions: string;
  welcome: string;
  suggestions: string[];
  color: string;
  avatar: string;
}

const busyOf = (k: Knowledge) => k.reads.some((r) => r.status === "reading") || k.sources.some((s) => s.status === "pending" || s.status === "training");
const KIND_ICON = { website: Globe, file: FileText, text: Type, qa: MessageCircleQuestion } as const;
const host = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    return url ?? "";
  }
};

/** How much Keel read, in words: "12 pages and 2 documents", "1 document". */
function counted(sources: { kind: string }[]): string {
  const pages = sources.filter((x) => x.kind === "website").length;
  const docs = sources.length - pages;
  const words = [pages ? `${pages} page${pages === 1 ? "" : "s"}` : "", docs ? `${docs} document${docs === 1 ? "" : "s"}` : ""].filter(Boolean);
  return words.join(" and ");
}

/**
 * Step 2: Keel reads the website (and any documents) while the builder watches, writes a first draft of the
 * business's profile and its agent, and the builder reviews it beside the live chat, which already uses the draft.
 */
export function LearnStep({ agent, initial }: { agent: Agent; initial: Knowledge }) {
  const router = useRouter();
  const c = agent.config;
  const [knowledge, setKnowledge] = useState(initial);
  const [phase, setPhase] = useState<Phase>("reading");
  const [review, setReview] = useState<Review>({
    name: agent.name,
    industry: c.industry,
    summary: c.profile.summary,
    offerings: c.profile.offerings.join("\n"),
    audience: c.profile.audience,
    tone: c.profile.tone,
    instructions: c.instructions,
    welcome: c.appearance.welcome[0] ?? "",
    suggestions: c.appearance.suggestions,
    color: c.appearance.color,
    avatar: c.appearance.avatar ?? "",
  });
  const [brand, setBrand] = useState<Brand>(c.brand);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);

  async function draft() {
    setPhase("drafting");
    setDraftNote(null);
    const res = await fetch(`/api/agents/${agent.id}/profile`, { method: "POST" }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { draft?: Omit<Review, "offerings" | "welcome" | "color" | "avatar"> & { offerings: string[]; welcome: string }; error?: string };
    if (res?.ok && body.draft) {
      const d = body.draft;
      setReview((r) => ({ ...r, name: d.name, industry: d.industry, summary: d.summary, offerings: d.offerings.join("\n"), audience: d.audience, tone: d.tone, instructions: d.instructions, welcome: d.welcome, suggestions: d.suggestions }));
    } else {
      setDraftNote(body.error ?? "Keel couldn't write a draft just now. Fill it in yourself, or try again.");
    }
    setPhase("review");
  }

  // Watch the reading; when it's over, draft the profile (or say what went wrong).
  useEffect(() => {
    if (phase !== "reading") return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/agents/${agent.id}/sources`, { cache: "no-store" }).catch(() => undefined);
      const next = res?.ok ? ((await res.json()) as Knowledge) : knowledge;
      setKnowledge(next);
      if (busyOf(next) || finished.current) return;
      finished.current = true;
      // The brand read with the website is now on the agent: its colours, logo, and the look it gave the chat.
      const fresh = await fetch(`/api/agents/${agent.id}`, { cache: "no-store" }).catch(() => undefined);
      const latest = fresh?.ok ? ((await fresh.json()) as { agent: Agent }).agent : undefined;
      if (latest) {
        setBrand(latest.config.brand);
        setReview((r) => ({ ...r, color: latest.config.appearance.color, avatar: latest.config.appearance.avatar ?? "" }));
      }
      if (next.sources.length) await draft();
      else if (next.reads.some((r) => r.status === "failed")) setPhase("failed");
      else setPhase("review");
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- polls on each change of what's known
  }, [phase, knowledge, agent.id]);

  async function saveAndContinue() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: review.name, config: toConfig(review) }),
    }).catch(() => undefined);
    if (!res?.ok) {
      setSaving(false);
      setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Your agent couldn't be saved. Try again.");
      return;
    }
    router.push(`/app/agents/${agent.id}/setup/knowledge`);
    router.refresh();
  }

  const read = knowledge.reads[0];
  const site = host(read?.url ?? c.profile.website);

  if (phase === "reading" || phase === "drafting") {
    const sources = [...knowledge.sources].reverse();
    const ready = knowledge.sources.filter((s) => s.status === "ready").length;
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-4 border-b border-line px-6 py-5">
            <span className="relative inline-flex size-11 items-center justify-center rounded-xl bg-brand-tint text-brand">
              {phase === "drafting" ? <Sparkles className="size-5" /> : <Globe className="size-5" />}
              <Spinner className="absolute -right-1 -top-1 size-4 rounded-full bg-panel text-brand" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">{phase === "drafting" ? "Writing your agent's first draft…" : site ? `Reading ${site}…` : "Learning from your documents…"}</h1>
              <p className="text-sm text-muted">
                {phase === "drafting"
                  ? "Keel is working out what your business does, what it offers and how it talks."
                  : `${counted(knowledge.sources)} found, ${ready} learned`}
              </p>
            </div>
          </div>
          {read?.brand && (read.brand.logo || read.brand.colors.length > 0) && (
            <div className="flex items-center gap-3 border-b border-line bg-panel-2/50 px-6 py-3 text-sm">
              <span className="text-muted">Your brand:</span>
              {read.brand.logo && <span className="rounded-md bg-good-tint px-2 py-0.5 text-xs font-medium text-good">Logo found</span>}
              <span className="flex gap-1">
                {read.brand.colors.map((col) => (
                  <span key={col} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: col }} title={col} />
                ))}
              </span>
            </div>
          )}
          <ul className="max-h-[340px] divide-y divide-line overflow-y-auto">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
            {!sources.length && <li className="px-6 py-8 text-center text-sm text-muted">Looking for pages…</li>}
          </ul>
        </div>
        {phase === "reading" && (
          <div className="card mt-5 p-5">
            <p className="mb-3 text-sm font-medium">Have documents too? Add them while you wait.</p>
            <FilesForm agentId={agent.id} onAdded={async () => {}} />
          </div>
        )}
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="mx-auto w-full max-w-[640px] space-y-5">
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-bad" />
            <div>
              <h1 className="text-lg font-semibold">We couldn&apos;t read {site || "that website"}</h1>
              <p className="mt-1 text-sm text-muted">{read?.error ?? "No readable pages were found there."}</p>
            </div>
          </div>
          <div className="mt-5">
            <WebsiteForm
              agentId={agent.id}
              reads={[]}
              onAdded={async () => {
                finished.current = false;
                setKnowledge({ sources: [], reads: [] });
                setPhase("reading");
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-5 py-4">
          <p className="text-sm text-muted">Or skip it: write the profile yourself and add documents next.</p>
          <button type="button" onClick={() => setPhase("review")} className="btn btn-secondary">Continue without it</button>
        </div>
      </div>
    );
  }

  const set = (patch: Partial<Review>) => setReview((r) => ({ ...r, ...patch }));
  const look = {
    ...lookOf(c.appearance),
    displayName: review.name || agent.name,
    welcome: review.welcome ? [review.welcome] : [],
    suggestions: review.suggestions.filter((s) => s.trim()),
    color: review.color,
    avatar: review.avatar || undefined,
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{knowledge.sources.length ? "Here's what Keel learned" : "Tell Keel about your business"}</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {knowledge.sources.length ? `From ${counted(knowledge.sources)}. Check it, change anything that's off, and try it in the chat.` : "A few lines are enough. Your agent keeps them in mind for every answer."}
            </p>
          </div>
          {knowledge.sources.length > 0 && (
            <button type="button" onClick={() => void draft()} className="btn btn-secondary">
              <Sparkles className="size-4" /> Draft again
            </button>
          )}
        </div>
        {draftNote && <Notice tone="warn">{draftNote}</Notice>}

        <section className="card p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Your brand</h2>
          <BrandPicker brand={brand} name={review.name || agent.name} color={review.color} avatar={review.avatar} onColor={(color) => set({ color })} onAvatar={(avatar) => set({ avatar })} />
          {!brand.colors.length && !brand.logo && <p className="mt-3 text-xs text-muted">No logo or colours were found{site ? ` on ${site}` : ""}. Upload a picture, and pick a colour later in the playground.</p>}
        </section>

        <section className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Business name</span>
              <input value={review.name} onChange={(e) => set({ name: e.target.value })} className="field" maxLength={80} />
            </label>
            <label className="block">
              <span className="label">Industry</span>
              <select value={review.industry} onChange={(e) => set({ industry: e.target.value as Industry })} className="field">
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{INDUSTRY_PRESETS[i].label}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">What you do</span>
            <textarea value={review.summary} onChange={(e) => set({ summary: e.target.value })} rows={3} className="field resize-y" maxLength={1500} placeholder="What your business does, in two or three sentences." />
          </label>
          <label className="block">
            <span className="label">What you offer</span>
            <textarea value={review.offerings} onChange={(e) => set({ offerings: e.target.value })} rows={3} className="field resize-y" placeholder="One product, service or plan per line." />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Your customers</span>
              <input value={review.audience} onChange={(e) => set({ audience: e.target.value })} className="field" maxLength={500} />
            </label>
            <label className="block">
              <span className="label">How you talk to them</span>
              <input value={review.tone} onChange={(e) => set({ tone: e.target.value })} className="field" maxLength={300} />
            </label>
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="text-[15px] font-semibold">Your agent</h2>
          <label className="block">
            <span className="label">What it does</span>
            <textarea value={review.instructions} onChange={(e) => set({ instructions: e.target.value })} rows={4} className="field resize-y" maxLength={8000} />
          </label>
          <label className="block">
            <span className="label">First message</span>
            <input value={review.welcome} onChange={(e) => set({ welcome: e.target.value })} className="field" maxLength={400} />
          </label>
          <div>
            <span className="label">Questions customers ask most</span>
            <div className="space-y-2">
              {review.suggestions.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input value={s} onChange={(e) => set({ suggestions: review.suggestions.map((x, j) => (j === i ? e.target.value : x)) })} className="field" maxLength={120} aria-label={`Question ${i + 1}`} />
                  <button type="button" onClick={() => set({ suggestions: review.suggestions.filter((_, j) => j !== i) })} className="btn btn-ghost px-2" title="Remove">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              {review.suggestions.length < 4 && (
                <button type="button" onClick={() => set({ suggestions: [...review.suggestions, ""] })} className="btn btn-secondary">
                  <Plus className="size-4" /> Add a question
                </button>
              )}
            </div>
          </div>
        </section>

        {error && <Notice>{error}</Notice>}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-5 py-4">
          <p className="text-sm text-muted">You can change all of this later, in Teach it › How it behaves.</p>
          <button type="button" onClick={() => void saveAndContinue()} disabled={saving || !review.name.trim() || !review.instructions.trim()} className="btn btn-primary">
            {saving ? <Spinner /> : null} Looks good, continue {!saving && <ArrowRight className="size-4" />}
          </button>
        </div>
      </div>

      <div className="xl:sticky xl:top-20 xl:self-start">
        <p className="mb-2 text-sm text-muted">{knowledge.sources.length ? "Try the draft: it answers from what Keel read." : "Try the draft. Until you add what it should know (next step), it can only say it doesn't know."}</p>
        <ChatWindow agentId={agent.id} look={look} endpoint={`/api/agents/${agent.id}/chat`} extra={{ preview: toConfig(review) }} details className="h-[620px] max-h-[calc(100dvh-8rem)] rounded-2xl" />
      </div>
    </div>
  );
}

function SourceRow({ source }: { source: Source }) {
  const Icon = KIND_ICON[source.kind];
  return (
    <li className="flex items-center gap-3 px-6 py-2.5 text-sm">
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{source.title}</span>
        {source.url && <span className="block truncate text-xs text-subtle">{source.url.replace(/^https?:\/\/(www\.)?/, "")}</span>}
      </span>
      {source.status === "ready" ? (
        <Check className="size-4 text-good" />
      ) : source.status === "failed" ? (
        <CircleAlert className="size-4 text-bad" />
      ) : source.status === "training" ? (
        <Spinner className="size-4 text-brand" />
      ) : (
        <Clock className="size-4 text-subtle" />
      )}
    </li>
  );
}

function toConfig(r: Review) {
  return {
    industry: r.industry,
    instructions: r.instructions.trim() || "Help people with their questions, kindly and briefly.",
    profile: {
      summary: r.summary.trim(),
      offerings: r.offerings.split("\n").map((o) => o.trim()).filter(Boolean).slice(0, 12),
      audience: r.audience.trim(),
      tone: r.tone.trim(),
    },
    appearance: {
      displayName: r.name.trim() || "Assistant",
      welcome: r.welcome.trim() ? [r.welcome.trim()] : [],
      suggestions: r.suggestions.map((s) => s.trim()).filter(Boolean),
      color: r.color,
      avatar: r.avatar,
    },
  };
}
