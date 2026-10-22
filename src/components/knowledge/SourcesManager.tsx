"use client";

import { FileText, Globe, MessageCircleQuestion, MoreHorizontal, RefreshCw, Search, Trash2, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Source, SourceKind } from "@/core/agents";
import { Dialog } from "../Dialog";
import { Notice, Spinner, timeAgo } from "../ui";
import { FilesForm, QaForm, SourceDialog, StatusPill, TextForm, WebsiteForm, host, type Knowledge } from "./KnowledgeEditor";

const ADD: { kind: SourceKind; label: string; text: string; icon: typeof Globe }[] = [
  { kind: "file", label: "Add files", text: "PDF, Word, text or a picture", icon: FileText },
  { kind: "website", label: "Add website", text: "Read your pages", icon: Globe },
  { kind: "text", label: "Add text", text: "Type or paste anything", icon: Type },
  { kind: "qa", label: "Add Q&A", text: "An exact answer to a question", icon: MessageCircleQuestion },
];
const KIND_LABEL: Record<SourceKind, string> = { website: "Website page", file: "File", text: "Text", qa: "Q&A" };
const KIND_ICON: Record<SourceKind, typeof Globe> = { website: Globe, file: FileText, text: Type, qa: MessageCircleQuestion };
const PAGE = 20;

const size = (chars: number) => (chars < 1024 ? `${chars} B` : chars < 1024 * 1024 ? `${Math.round(chars / 1024)} KB` : `${(chars / 1024 / 1024).toFixed(1)} MB`);

/**
 * Everything the agent knows, as a list to search, filter and tidy, with the four ways to add more, how much of the
 * plan's space it uses, and keeping the website up to date (read again now, or on a schedule).
 */
export function SourcesManager({
  agentId,
  initial,
  limitChars,
  resync,
}: {
  agentId: string;
  initial: Knowledge;
  limitChars: number;
  resync: { every: "off" | "daily" | "weekly"; lastAt?: string };
}) {
  const [knowledge, setKnowledge] = useState(initial);
  const [adding, setAdding] = useState<SourceKind | null>(null);
  const [viewing, setViewing] = useState<Source | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name" | "size">("newest");
  const [bulk, setBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [menu, setMenu] = useState<string | null>(null);
  const [every, setEvery] = useState(resync.every);
  const [lastAt, setLastAt] = useState(resync.lastAt);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/sources`, { cache: "no-store" });
    if (res.ok) setKnowledge((await res.json()) as Knowledge);
  }, [agentId]);

  const busy = knowledge.sources.some((s) => s.status === "pending" || s.status === "training") || knowledge.reads.some((r) => r.status === "reading");
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => void refresh(), 1200);
    return () => clearTimeout(timer);
  }, [busy, knowledge, refresh]);

  const totalChars = knowledge.sources.reduce((n, s) => n + s.chars, 0);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = knowledge.sources.filter((s) => (kind === "all" || s.kind === kind) && (!q || `${s.title} ${s.url ?? ""}`.toLowerCase().includes(q)));
    const sorted = [...filtered].sort((a, b) =>
      sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : sort === "name" ? a.title.localeCompare(b.title) : b.chars - a.chars,
    );
    return sorted;
  }, [knowledge.sources, query, kind, sort]);

  async function remove(ids: string[]) {
    await Promise.all(ids.map((id) => fetch(`/api/agents/${agentId}/sources/${id}`, { method: "DELETE" })));
    setSelected(new Set());
    setBulk(false);
    setMenu(null);
    await refresh();
  }

  async function readAgain() {
    setNotice(null);
    const res = await fetch(`/api/agents/${agentId}/sources/resync`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { sites?: number; error?: string };
    if (!res.ok) return setNotice(body.error ?? "Couldn't start reading again.");
    setLastAt(new Date().toISOString());
    setNotice(body.sites ? `Reading ${body.sites} website${body.sites === 1 ? "" : "s"} again. Only pages that changed are learned again.` : "There's no website to read again. Add one first.");
    await refresh();
  }

  async function changeEvery(value: typeof every) {
    setEvery(value);
    await fetch(`/api/agents/${agentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: { resync: { every: value } } }) });
  }

  const added = async () => {
    await refresh();
  };

  return (
    <div className="space-y-6">
      {/* Reading again is for what came from a website: an agent taught only with documents has nothing to read. */}
      {knowledge.sources.some((s) => s.kind === "website") && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <span className="text-muted">{lastAt ? `Website last read ${timeAgo(lastAt)}` : "Website not read again since it was added"}</span>
          <label className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 shadow-sm">
            <span className="font-medium">Keep up with my website</span>
            <select value={every} onChange={(e) => void changeEvery(e.target.value as typeof every)} className="bg-transparent text-muted outline-none">
              <option value="off">Off</option>
              <option value="daily">Read it daily</option>
              <option value="weekly">Read it weekly</option>
            </select>
          </label>
          <button type="button" onClick={() => void readAgain()} className="btn btn-secondary px-3 py-1.5">
            <RefreshCw className="size-4" /> Read my website again
          </button>
        </div>
      )}
      {notice && <Notice tone="brand">{notice}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ADD.map(({ kind: k, label, text, icon: Icon }) => (
          <button key={k} type="button" onClick={() => setAdding(k)} className="card flex flex-col items-start gap-3 p-4 text-left transition hover:border-line-strong hover:shadow-raised">
            <span className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-panel-2">
              <Icon className="size-[18px]" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">{label}</span>
              <span className="block text-xs text-muted">{text}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sources…" className="field pl-9" />
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind | "all")} className="field w-auto">
          <option value="all">All sources</option>
          <option value="website">Website pages</option>
          <option value="file">Files</option>
          <option value="text">Text</option>
          <option value="qa">Q&A</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field w-auto">
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
          <option value="size">Largest</option>
        </select>
        <button type="button" onClick={() => (setBulk(!bulk), setSelected(new Set()))} className={`btn ${bulk ? "btn-primary" : "btn-secondary"}`}>
          {bulk ? "Done" : "Bulk select"}
        </button>
        {bulk && selected.size > 0 && (
          <button type="button" onClick={() => void remove([...selected])} className="btn btn-danger">
            <Trash2 className="size-4" /> Remove {selected.size}
          </button>
        )}
        <span className="ml-auto text-sm text-muted">
          Total size: <strong className="text-text">{size(totalChars)}</strong> / {size(limitChars)}
        </span>
      </div>

      <div className="card overflow-hidden">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.slice(0, shown).map((s) => {
              const Icon = KIND_ICON[s.kind];
              return (
                <li key={s.id} className="relative flex items-center gap-3 px-4 py-3">
                  {bulk && (
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        setSelected(next);
                      }}
                      className="size-4 accent-[var(--ink)]"
                      aria-label={`Select ${s.title}`}
                    />
                  )}
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-muted">
                    <Icon className="size-4" />
                  </span>
                  <button type="button" onClick={() => setViewing(s)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium hover:underline">{s.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {s.url ? host(s.url) : KIND_LABEL[s.kind]} · Added {timeAgo(s.createdAt)}
                    </span>
                    {s.error && <span className={`mt-0.5 block text-xs ${s.status === "failed" ? "text-bad" : "text-warn"}`}>{s.error}</span>}
                  </button>
                  <span className="hidden text-xs tabular-nums text-muted sm:inline">{size(s.chars)}</span>
                  <StatusPill source={s} />
                  <button type="button" onClick={() => setMenu(menu === s.id ? null : s.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="More">
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menu === s.id && (
                    <div className="absolute right-4 top-12 z-10 w-48 rounded-xl border border-line bg-panel p-1 text-sm shadow-raised">
                      <button type="button" onClick={() => (setViewing(s), setMenu(null))} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2">
                        {s.kind === "text" || s.kind === "qa" ? "View and edit" : "View text"}
                      </button>
                      {s.kind === "website" && (
                        <button type="button" onClick={() => void readAgain().then(() => setMenu(null))} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-panel-2">
                          Read the site again
                        </button>
                      )}
                      <button type="button" onClick={() => void remove([s.id])} className="block w-full rounded-lg px-3 py-2 text-left text-bad hover:bg-bad-tint">
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-6 py-14 text-center">
            <p className="font-medium">{knowledge.sources.length ? "Nothing matches" : "Nothing here yet"}</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{knowledge.sources.length ? "Try another search or filter." : "Add your website, files, text or questions and answers. The agent answers only from what's here."}</p>
          </div>
        )}
        {list.length > shown && (
          <button type="button" onClick={() => setShown(shown + PAGE)} className="w-full border-t border-line py-2.5 text-sm text-muted hover:bg-panel-2">
            Show more ({list.length - shown} left)
          </button>
        )}
      </div>

      {knowledge.reads.filter((r) => r.status === "reading").map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-sm text-muted">
          <Spinner className="size-4 text-brand" /> {r.choosing ? "Finding pages on" : "Reading"} {host(r.url)}… {r.pages} page{r.pages === 1 ? "" : "s"} so far
        </div>
      ))}

      {adding && (
        <Dialog title={ADD.find((a) => a.kind === adding)!.label} onClose={() => setAdding(null)}>
          {adding === "website" && <WebsiteForm agentId={agentId} reads={knowledge.reads} onAdded={added} />}
          {adding === "file" && <FilesForm agentId={agentId} onAdded={added} />}
          {adding === "text" && <TextForm agentId={agentId} onAdded={async () => (await added(), setAdding(null))} />}
          {adding === "qa" && <QaForm agentId={agentId} onAdded={async () => (await added(), setAdding(null))} />}
        </Dialog>
      )}
      {viewing && <SourceDialog agentId={agentId} source={viewing} onClose={() => setViewing(null)} onSaved={refresh} />}
    </div>
  );
}
