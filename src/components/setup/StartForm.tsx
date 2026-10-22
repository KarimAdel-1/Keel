"use client";

import { ArrowRight, FileText, FileUp, Globe, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/core/agents";
import { Notice, Spinner } from "../ui";

/**
 * Step 1: where Keel learns about the business. The website is the quickest start: Keel reads it and drafts the
 * agent. Without one, the business's name and its documents do the same job.
 */
/** A website address as a host to compare: "https://www.Harbor.example/" and "harbor.example" are the same site. */
const hostOf = (address: string) => {
  try {
    return new URL(/^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

export function StartForm({ existing = [] }: { existing?: { id: string; name: string; website: string }[] }) {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const already = website.trim() ? existing.find((a) => hostOf(a.website) === hostOf(website)) : undefined;
  const [manual, setManual] = useState(false);
  const [name, setName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  async function create(body: Record<string, string>): Promise<string | undefined> {
    const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => undefined);
    const json = ((await res?.json().catch(() => ({}))) ?? {}) as { agent?: { id: string }; error?: string };
    if (!res?.ok || !json.agent) {
      setError(json.error ?? "Your agent couldn't be created. Check your connection and try again.");
      return undefined;
    }
    return json.agent.id;
  }

  async function fromWebsite(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const id = await create({ website });
    if (!id) return setBusy(false);
    router.push(`/app/agents/${id}/setup/learn`);
    router.refresh();
  }

  async function fromName(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const id = await create({ name });
    if (!id) return setBusy(false);
    if (files.length) {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      await fetch(`/api/agents/${id}/sources`, { method: "POST", body: form }).catch(() => undefined);
    }
    router.push(`/app/agents/${id}/setup/learn`);
    router.refresh();
  }

  function addFiles(list: FileList | null) {
    const chosen = [...(list ?? [])];
    const tooBig = chosen.filter((f) => f.size > MAX_UPLOAD_BYTES);
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` : null);
    setFiles((f) => [...f, ...chosen.filter((x) => x.size <= MAX_UPLOAD_BYTES)].slice(0, 20));
    if (picker.current) picker.current.value = "";
  }

  return (
    <div className="mx-auto w-full max-w-[640px]">
      <div className="text-center">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
          <Sparkles className="size-6" />
        </span>
        <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.025em]">Let&apos;s build your agent</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
          {manual
            ? "Give your business's name and any documents you have, like FAQs or price lists. Keel drafts your agent from them. You check it before anything goes live."
            : "Start with your website. Keel reads it, learns about your business and drafts your agent. You check it before anything goes live."}
        </p>
      </div>

      {!manual ? (
        <form onSubmit={fromWebsite} className="card mt-8 p-6">
          <label className="block">
            <span className="label">Your website</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className="field py-3 pl-10 text-[15px]" placeholder="yourbusiness.com" inputMode="url" autoComplete="url" autoFocus required />
              </div>
              <button type="submit" disabled={busy || !website.trim()} className="btn btn-primary px-5 py-3">
                {busy ? <Spinner /> : null} Read my website {!busy && <ArrowRight className="size-4" />}
              </button>
            </div>
          </label>
          <ul className="mt-5 grid gap-2 text-sm text-muted sm:grid-cols-2">
            {["Reads up to 50 pages", "Picks up your logo and colours", "Drafts your agent", "You review every word"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-good" /> {t}
              </li>
            ))}
          </ul>
          {already && (
            <div className="mt-4">
              <Notice tone="warn">
                You already have an agent for this website: {already.name}.{" "}
                <Link href={`/app/agents/${already.id}`} className="font-medium underline underline-offset-2">
                  Open it
                </Link>
                , or read the website again to make another.
              </Notice>
            </div>
          )}
          {error && <div className="mt-4"><Notice>{error}</Notice></div>}
        </form>
      ) : (
        <form onSubmit={fromName} className="card mt-8 space-y-5 p-6">
          <label className="block">
            <span className="label">What&apos;s your business called?</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="field py-2.5 text-[15px]" placeholder="Your business's name" maxLength={80} autoFocus required />
          </label>
          <div>
            <span className="label">Documents about your business (optional)</span>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong px-4 py-7 text-center transition hover:border-subtle"
            >
              <input ref={picker} type="file" multiple accept={UPLOAD_TYPES} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
              <FileUp className="size-5 text-muted" />
              <span className="text-sm font-medium">Drop files here, or click to choose</span>
              <span className="text-xs text-muted">FAQs, price lists, policies, menus: PDF, Word, Markdown, text, or a picture of one.</span>
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-panel-2 px-3 py-2 text-sm">
                    <FileText className="size-4 text-muted" /> <span className="flex-1 truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted hover:text-text" title="Remove">
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {error && <Notice>{error}</Notice>}
          <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary w-full py-2.5">
            {busy ? <Spinner /> : null} Continue {!busy && <ArrowRight className="size-4" />}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-muted">
        {manual ? (
          <button type="button" onClick={() => (setManual(false), setError(null))} className="link">I have a website after all</button>
        ) : (
          <>
            No website?{" "}
            <button type="button" onClick={() => (setManual(true), setError(null))} className="link">Start with your business name and documents</button>
          </>
        )}
      </p>
    </div>
  );
}
