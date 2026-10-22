"use client";

import { CircleAlert, Clock, FileText, FileUp, Globe, MessageCircleQuestion, Pencil, Trash2, Type, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES, parseQa, type Source, type SourceKind } from "@/core/agents";
import type { SiteRead } from "@/platform/knowledge/jobs";
import { Notice, Pill, Spinner } from "../ui";

export interface Knowledge {
  sources: Source[];
  reads: SiteRead[];
}

const KINDS: { kind: SourceKind; label: string; group: string; icon: typeof Globe }[] = [
  { kind: "website", label: "Website", group: "Website pages", icon: Globe },
  { kind: "file", label: "Files", group: "Files", icon: FileText },
  { kind: "text", label: "Text", group: "Text", icon: Type },
  { kind: "qa", label: "Q&A", group: "Questions and answers", icon: MessageCircleQuestion },
];

export const host = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return url;
  }
};

async function errorOf(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? fallback;
}

/**
 * Everything an agent knows, and the four ways to add to it. Sources train in the background; their status updates
 * by itself, and the agent can answer from each one as soon as it shows "Ready".
 */
export function KnowledgeEditor({ agentId, agentName, initial, onChange }: { agentId: string; agentName: string; initial: Knowledge; onChange?: (k: Knowledge) => void }) {
  const [knowledge, setKnowledge] = useState(initial);
  const [tab, setTab] = useState<SourceKind>(initial.sources.length ? "text" : "website");
  const [viewing, setViewing] = useState<Source | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/sources`, { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as Knowledge;
    setKnowledge(next);
    onChange?.(next);
  }, [agentId, onChange]);

  const busy = knowledge.sources.some((s) => s.status === "pending" || s.status === "training") || knowledge.reads.some((r) => r.status === "reading");
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => void refresh(), 1200);
    return () => clearTimeout(timer);
  }, [busy, knowledge, refresh]);

  const ready = knowledge.sources.filter((s) => s.status === "ready").length;
  const total = knowledge.sources.length;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-line bg-panel-2/60 p-1.5" role="tablist">
          {KINDS.map(({ kind, label, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={tab === kind}
              onClick={() => setTab(kind)}
              className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${tab === kind ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text"}`}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "website" && <WebsiteForm agentId={agentId} reads={knowledge.reads} onAdded={refresh} />}
          {tab === "file" && <FilesForm agentId={agentId} onAdded={refresh} />}
          {tab === "text" && <TextForm agentId={agentId} onAdded={refresh} />}
          {tab === "qa" && <QaForm agentId={agentId} onAdded={refresh} />}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">What {agentName} knows</h2>
          {total > 0 && (
            <span className="text-sm text-muted">
              {ready === total ? `${total} source${total === 1 ? "" : "s"}, all ready` : `${ready} of ${total} ready`}
            </span>
          )}
        </div>
        {total > 0 && ready < total && (
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(6, (ready / total) * 100)}%` }} />
          </div>
        )}
        {total === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="font-medium">Nothing yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Add your website, a file or some text above. {agentName} answers only from what you add here, so start with what customers ask about most.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {KINDS.map(({ kind, group, icon }) => {
              const items = knowledge.sources.filter((s) => s.kind === kind);
              return items.length ? <SourceGroup key={kind} title={group} icon={icon} items={items} agentId={agentId} onView={setViewing} onChanged={refresh} /> : null;
            })}
          </div>
        )}
      </section>

      {viewing && <SourceDialog agentId={agentId} source={viewing} onClose={() => setViewing(null)} onSaved={refresh} />}
    </div>
  );
}

// ── Adding knowledge ──────────────────────────────────────────────────────────────────────────────────────────────

export function WebsiteForm({ agentId, reads, onAdded }: { agentId: string; reads: SiteRead[]; onAdded: () => Promise<void> }) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent, choose = false) {
    event.preventDefault();
    if (!url.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "website", url, maxPages, ...(choose ? { choose: true } : {}) }) });
    setSending(false);
    if (!res.ok) return setError(await errorOf(res, "That website couldn't be read."));
    setUrl("");
    await onAdded();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="label">Your website address</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="field" placeholder="yourbusiness.com" inputMode="url" autoComplete="url" required />
          <select value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} className="field w-full sm:w-36" aria-label="How many pages">
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                Up to {n} pages
              </option>
            ))}
          </select>
          <button type="submit" disabled={sending || !url.trim()} className="btn btn-primary shrink-0">
            {sending ? <Spinner /> : <Globe className="size-4" />} Read website
          </button>
        </div>
        <span className="hint">
          Keel reads your sitemap and follows the links on your site, FAQ, shipping, returns, pricing and contact pages first. It skips carts, logins and pages your robots.txt asks readers to skip.{" "}
          <button type="button" onClick={(e) => void submit(e, true)} disabled={sending || !url.trim()} className="link disabled:opacity-50">
            Or choose the pages yourself first.
          </button>
        </span>
      </label>
      {error && <Notice>{error}</Notice>}
      {reads.filter((r) => r.status === "found" && r.found).map((r) => (
        <PagePicker key={r.id} agentId={agentId} read={r} onLearned={onAdded} />
      ))}
      {reads.filter((r) => r.status !== "found").map((r) => (
        <div key={r.id} className="flex items-start gap-2.5 rounded-lg bg-panel-2 px-3 py-2.5 text-sm">
          {r.status === "reading" ? <Spinner className="mt-0.5 size-4 text-brand" /> : r.status === "done" ? <Globe className="mt-0.5 size-4 text-good" /> : <CircleAlert className="mt-0.5 size-4 text-bad" />}
          <div className="min-w-0">
            <p className="truncate font-medium">{host(r.url)}</p>
            <p className="text-muted">
              {r.status === "reading"
                ? `${r.choosing ? "Finding pages" : "Reading"}… ${r.pages} page${r.pages === 1 ? "" : "s"} so far`
                : r.status === "done"
                  ? `Read ${r.pages} page${r.pages === 1 ? "" : "s"}. They're listed below.`
                  : r.error}
            </p>
          </div>
        </div>
      ))}
    </form>
  );
}

/**
 * The pages Keel found on a website, by section, Keel's picks ticked (the ones customers ask about first). The
 * builder keeps or leaves out pages and sections; only what's kept is learned.
 */
function PagePicker({ agentId, read, onLearned }: { agentId: string; read: SiteRead; onLearned: () => Promise<void> }) {
  const found = read.found ?? [];
  const [kept, setKept] = useState(() => new Set(found.filter((p) => p.picked).map((p) => p.url)));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = [...new Set(found.map((p) => p.section))].map((name) => ({ name, pages: found.filter((p) => p.section === name) }));
  const flip = (urls: string[], on: boolean) =>
    setKept((k) => {
      const next = new Set(k);
      for (const u of urls) {
        if (on) next.add(u);
        else next.delete(u);
      }
      return next;
    });

  async function learn() {
    setSending(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/sources/pick`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ readId: read.id, urls: [...kept] }) }).catch(() => undefined);
    setSending(false);
    if (!res?.ok) return setError(res ? await errorOf(res, "Those pages couldn't be learned.") : "The connection dropped. Try again.");
    await onLearned();
  }

  return (
    <div className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {found.length} pages found on {host(read.url)}
          </p>
          <p className="text-xs text-muted">Keel ticked the ones customers ask about most. Keep what your agent should know.</p>
        </div>
        <button type="button" onClick={() => void learn()} disabled={sending || !kept.size} className="btn btn-primary px-3 py-1.5 text-xs">
          {sending && <Spinner className="size-3.5" />} Learn {kept.size} page{kept.size === 1 ? "" : "s"}
        </button>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <Notice>{error}</Notice>
        </div>
      )}
      <div className="max-h-[420px] divide-y divide-line overflow-y-auto">
        {sections.map((sec) => {
          const all = sec.pages.every((p) => kept.has(p.url));
          return (
            <div key={sec.name} className="px-4 py-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={all} onChange={(e) => flip(sec.pages.map((p) => p.url), e.target.checked)} className="accent-[var(--ink)]" />
                {sec.name} <span className="font-normal text-subtle">({sec.pages.filter((p) => kept.has(p.url)).length} of {sec.pages.length})</span>
              </label>
              <ul className="mt-1.5 space-y-1 pl-6">
                {sec.pages.map((p) => (
                  <li key={p.url}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={kept.has(p.url)} onChange={(e) => flip([p.url], e.target.checked)} className="mt-1 accent-[var(--ink)]" />
                      <span className="min-w-0">
                        <span className="block truncate">{p.title}</span>
                        <span className="block truncate text-xs text-subtle">{new URL(p.url).pathname}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FilesForm({ agentId, onAdded }: { agentId: string; onAdded: () => Promise<void> }) {
  const [uploading, setUploading] = useState(0);
  const [problems, setProblems] = useState<{ file: string; error: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES).map((f) => ({ file: f.name, error: `It's larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Split it into smaller files.` }));
    const ok = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    setProblems(tooBig);
    if (!ok.length) return;
    const form = new FormData();
    for (const f of ok) form.append("files", f);
    setUploading(ok.length);
    const res = await fetch(`/api/agents/${agentId}/sources`, { method: "POST", body: form }).catch(() => undefined);
    setUploading(0);
    if (picker.current) picker.current.value = "";
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { problems?: { file: string; error: string }[]; error?: string; refreshing?: boolean };
    setRefreshing(body.refreshing === true);
    setProblems([...tooBig, ...(body.problems ?? []), ...(body.error ? [{ file: "Upload", error: body.error }] : []), ...(res ? [] : [{ file: "Upload", error: "The upload didn't go through. Check your connection and try again." }])]);
    await onAdded();
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${over ? "border-brand bg-brand-tint" : "border-line-strong hover:border-subtle"}`}
      >
        <input ref={picker} type="file" multiple accept={UPLOAD_TYPES} className="sr-only" onChange={(e) => void upload(e.target.files)} />
        {uploading ? <Spinner className="size-6 text-brand" /> : <FileUp className="size-6 text-muted" />}
        <span className="text-sm font-medium">{uploading ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…` : "Drop files here, or click to choose"}</span>
        <span className="text-xs text-muted">PDF, Word, Markdown or text files, or pictures (a photo of a price list, a scanned page), up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB each. FAQs, price lists, policies and guides work best.</span>
      </label>
      {problems.map((p, i) => (
        <Notice key={i}>
          <strong>{p.file}:</strong> {p.error}
        </Notice>
      ))}
      {refreshing && <RefreshNotice agentId={agentId} />}
    </div>
  );
}

/** After documents are added to an agent that's set up: where Keel's update of its profile will appear. */
function RefreshNotice({ agentId }: { agentId: string }) {
  return (
    <Notice tone="brand">
      Keel is reading it to update the agent&apos;s profile, greeting and suggested questions. The changes will appear in{" "}
      <Link href={`/app/agents/${agentId}/backstage`} className="font-medium underline underline-offset-2">
        Backstage
      </Link>{" "}
      for you to approve. Your instructions, rules and earlier fixes stay as they are.
    </Notice>
  );
}

export function TextForm({ agentId, onAdded }: { agentId: string; onAdded: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setRefreshing(false);
    const res = await fetch(`/api/agents/${agentId}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "text", title, content }) });
    setSending(false);
    if (!res.ok) return setError(await errorOf(res, "That text couldn't be added."));
    setRefreshing(((await res.json().catch(() => ({}))) as { refreshing?: boolean }).refreshing === true);
    setTitle("");
    setContent("");
    await onAdded();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="Opening hours and contact" required maxLength={200} />
      </label>
      <label className="block">
        <span className="label">Text</span>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7} className="field resize-y" placeholder="Paste or type anything your customers ask about: opening hours, prices, delivery times, a policy…" required />
      </label>
      {error && <Notice>{error}</Notice>}
      {refreshing && <RefreshNotice agentId={agentId} />}
      <button type="submit" disabled={sending || !title.trim() || !content.trim()} className="btn btn-primary">
        {sending && <Spinner />} Add text
      </button>
    </form>
  );
}

export function QaForm({ agentId, onAdded }: { agentId: string; onAdded: () => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/sources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "qa", question, answer }) });
    setSending(false);
    if (!res.ok) return setError(await errorOf(res, "That Q&A couldn't be added."));
    setQuestion("");
    setAnswer("");
    await onAdded();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">For questions you want answered exactly your way.</p>
      <label className="block">
        <span className="label">When someone asks</span>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} className="field" placeholder="Do you deliver on weekends?" required maxLength={500} />
      </label>
      <label className="block">
        <span className="label">Answer</span>
        <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} className="field resize-y" placeholder="Yes, on Saturdays between 9am and 1pm, for orders placed by Thursday." required />
      </label>
      {error && <Notice>{error}</Notice>}
      <button type="submit" disabled={sending || !question.trim() || !answer.trim()} className="btn btn-primary">
        {sending && <Spinner />} Add Q&A
      </button>
    </form>
  );
}

// ── The list ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function StatusPill({ source }: { source: Source }): ReactNode {
  if (source.status === "pending") return <Pill><Clock className="size-3" /> Waiting</Pill>;
  if (source.status === "training") return <Pill tone="brand"><Spinner className="size-3" /> Learning</Pill>;
  if (source.status === "failed") return <Pill tone="bad">Couldn&apos;t learn</Pill>;
  return source.error ? <Pill tone="warn">Ready, partly</Pill> : <Pill tone="good">Ready</Pill>;
}

function SourceGroup({ title, icon: Icon, items, agentId, onView, onChanged }: { title: string; icon: typeof Globe; items: Source[]; agentId: string; onView: (s: Source) => void; onChanged: () => Promise<void> }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, 8);

  async function remove(source: Source) {
    setConfirming(null);
    await fetch(`/api/agents/${agentId}/sources/${source.id}`, { method: "DELETE" });
    await onChanged();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-panel-2/60 px-4 py-2.5 text-sm font-medium">
        <Icon className="size-4 text-muted" /> {title} <span className="font-normal text-muted">{items.length}</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((s) => (
          <li key={s.id} className="px-4 py-3">
            {confirming === s.id ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Remove <strong className="break-all">{s.title}</strong>? The agent stops using it straight away.
                </span>
                <span className="flex gap-2">
                  <button type="button" className="btn btn-secondary px-3 py-1.5" onClick={() => setConfirming(null)}>Keep it</button>
                  <button type="button" className="btn bg-bad px-3 py-1.5 text-white hover:opacity-90" onClick={() => void remove(s)}>Remove</button>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => onView(s)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium hover:underline">{s.title}</p>
                  <p className="truncate text-xs text-muted">
                    {s.url ? host(s.url) : `${s.chars.toLocaleString()} characters`}
                  </p>
                </button>
                <StatusPill source={s} />
                <button type="button" onClick={() => onView(s)} className="btn btn-ghost p-1.5" title={s.kind === "text" || s.kind === "qa" ? "Edit" : "View"}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" onClick={() => setConfirming(s.id)} className="btn btn-ghost p-1.5 hover:text-bad" title="Remove">
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
            {s.error && confirming !== s.id && <p className={`mt-1.5 text-xs ${s.status === "failed" ? "text-bad" : "text-warn"}`}>{s.error}</p>}
          </li>
        ))}
      </ul>
      {items.length > 8 && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="w-full border-t border-line px-4 py-2 text-sm text-muted hover:bg-panel-2">
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

/** A source's text, to read; typed text and Q&A can be edited here (and are learned again when saved). */
export function SourceDialog({ agentId, source, onClose, onSaved }: { agentId: string; source: Source; onClose: () => void; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState(source.title);
  const [qa, setQa] = useState({ question: "", answer: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editable = source.kind === "text" || source.kind === "qa";

  useEffect(() => {
    dialog.current?.showModal();
    void fetch(`/api/agents/${agentId}/sources/${source.id}`)
      .then((r) => r.json())
      .then((body: { content?: string }) => {
        setContent(body.content ?? "");
        if (source.kind === "qa") setQa(parseQa(body.content ?? ""));
      });
  }, [agentId, source]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = source.kind === "qa" ? qa : { title, content };
    const res = await fetch(`/api/agents/${agentId}/sources/${source.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "Your changes couldn't be saved."));
    await onSaved();
    onClose();
  }

  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(720px,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-text shadow-raised backdrop:bg-black/30">
      <form onSubmit={save} className="flex max-h-[85dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-subtle">{KINDS.find((k) => k.kind === source.kind)?.group}</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold">{source.title}</h2>
            {source.url && (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="link text-sm">
                {host(source.url)}
              </a>
            )}
          </div>
          <button type="button" onClick={() => dialog.current?.close()} className="btn btn-ghost p-1.5" title="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {content === null ? (
            <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading…</div>
          ) : source.kind === "qa" ? (
            <>
              <label className="block">
                <span className="label">When someone asks</span>
                <input value={qa.question} onChange={(e) => setQa({ ...qa, question: e.target.value })} className="field" required />
              </label>
              <label className="block">
                <span className="label">Answer</span>
                <textarea value={qa.answer} onChange={(e) => setQa({ ...qa, answer: e.target.value })} rows={6} className="field resize-y" required />
              </label>
            </>
          ) : source.kind === "text" ? (
            <>
              <label className="block">
                <span className="label">Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" required />
              </label>
              <label className="block">
                <span className="label">Text</span>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={14} className="field resize-y" required />
              </label>
            </>
          ) : (
            <>
              <p className="text-xs text-muted">This is the text Keel read from it. To change it, update the {source.kind === "file" ? "file and upload it again" : "page and read the website again"}.</p>
              <pre className="whitespace-pre-wrap rounded-lg bg-panel-2 p-3 font-sans text-sm leading-relaxed">{content}</pre>
            </>
          )}
          {error && <Notice>{error}</Notice>}
        </div>
        {editable && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" onClick={() => dialog.current?.close()} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={saving || content === null} className="btn btn-primary">
              {saving && <Spinner />} Save and relearn
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}
