"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { INDUSTRIES, type Agent, type Industry } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { tokenCount } from "@/lib/models";
import { CopyCode } from "../channel/CopyCode";
import { Notice } from "../ui";
import { SaveBar, Section } from "./Section";
import { useDraft } from "./useDraft";

/** The agent's name, industry and whether it's live, what it uses, and deleting its conversations or the agent. */
export function SettingsForm({ agent, stats }: { agent: Agent; stats: { chars: number; tokens: number; conversations: number } }) {
  const router = useRouter();
  const { draft, set, dirty, saving, error, save, discard } = useDraft(
    agent.id,
    { name: agent.name, industry: agent.config.industry as Industry, enabled: agent.enabled },
    (d) => ({ name: d.name, enabled: d.enabled, config: { industry: d.industry } }),
  );
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<"ask" | "busy" | null>(null);
  const [cleared, setCleared] = useState<number | null>(null);

  async function clearConversations() {
    setClearing("busy");
    const res = await fetch(`/api/agents/${agent.id}/conversations`, { method: "DELETE" }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { deleted?: number };
    setClearing(null);
    setCleared(body.deleted ?? 0);
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" }).catch(() => undefined);
    if (!res?.ok) {
      setDeleting(false);
      setDeleteError("The agent couldn't be deleted. Try again.");
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Section title="Agent" description="Only your team sees these.">
        <div className="mb-4">
          <span className="label">Agent ID</span>
          <CopyCode code={agent.id} label="Copy" />
          <span className="hint block">For the REST API and the embed code.</span>
        </div>
        <label className="block">
          <span className="label">Agent name</span>
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="field" maxLength={80} />
          <span className="hint">Change the visitor-facing name in Try it → Display.</span>
        </label>
        <label className="mt-4 block">
          <span className="label">Industry</span>
          <select value={draft.industry} onChange={(e) => set({ industry: e.target.value as Industry })} className="field">
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_PRESETS[i].label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Availability" description="Whether visitors can chat with it once it's on your website.">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="mt-1 size-4 accent-[var(--brand)]" />
          <span>
            <span className="block text-sm font-medium">Live</span>
            <span className="hint block">When it&apos;s off, visitors see a short message instead of the chat, and only your team can test it here.</span>
          </span>
        </label>
      </Section>

      <Section title="Usage" description="What this agent holds and uses.">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Knowledge</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{stats.chars >= 1000 ? `${Math.round(stats.chars / 1000).toLocaleString("en-GB")}K` : stats.chars} chars</dd>
          </div>
          <div>
            <dt className="text-muted">Model use this month</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{tokenCount(stats.tokens)}</dd>
          </div>
          <div>
            <dt className="text-muted">Conversations</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{stats.conversations.toLocaleString("en-GB")}</dd>
          </div>
        </dl>
      </Section>

      {dirty && <SaveBar saving={saving} error={error} onSave={() => void save()} onDiscard={discard} note="Unsaved changes." />}

      <section className="rounded-2xl border border-bad/30 bg-panel p-5">
        <h2 className="text-base font-semibold text-bad">Delete all conversations</h2>
        <p className="mt-1 text-sm text-muted">Every conversation with this agent, from visitors and your own in Try it, is deleted for good. Leads, contacts and tickets stay.</p>
        {cleared !== null && <div className="mt-3"><Notice tone="good">Deleted {cleared} conversation{cleared === 1 ? "" : "s"}.</Notice></div>}
        {clearing === "ask" ? (
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void clearConversations()} className="btn bg-bad text-white hover:opacity-90">Yes, delete them</button>
            <button type="button" onClick={() => setClearing(null)} className="btn btn-secondary">Cancel</button>
          </div>
        ) : (
          <button type="button" disabled={clearing === "busy"} onClick={() => setClearing("ask")} className="btn btn-secondary mt-4 text-bad">
            {clearing === "busy" ? "Deleting…" : "Delete conversations"}
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-bad/30 bg-panel p-5">
        <h2 className="text-base font-semibold text-bad">Delete this agent</h2>
        <p className="mt-1 text-sm text-muted">Its knowledge, settings and conversations are deleted for good. This can&apos;t be undone.</p>
        <label className="mt-4 block">
          <span className="label">Type the agent&apos;s name, {agent.name}, to confirm</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="field" autoComplete="off" />
        </label>
        {deleteError && <div className="mt-3"><Notice>{deleteError}</Notice></div>}
        <button type="button" disabled={confirm.trim() !== agent.name || deleting} onClick={() => void remove()} className="btn mt-4 bg-bad text-white hover:opacity-90">
          {deleting ? "Deleting…" : "Delete agent"}
        </button>
      </section>
    </div>
  );
}
