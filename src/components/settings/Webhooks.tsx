"use client";

import { Plus, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useState } from "react";
import type { Webhook } from "@/platform/webhooks";
import { CopyCode } from "../channel/CopyCode";
import { Notice, Pill, timeAgo } from "../ui";

/**
 * The agent's webhooks: an address of yours that Keel calls when something happens (a lead, a form, a ticket…),
 * signed with a secret so you can check it came from Keel.
 */
export function Webhooks({ agentId, initial, events }: { agentId: string; initial: Webhook[]; events: { key: Webhook["events"][number]; text: string }[] }) {
  const [hooks, setHooks] = useState(initial);
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set(events.slice(0, 2).map((e) => e.key)));
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/webhooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events: [...chosen] }) });
    const body = (await res.json().catch(() => ({}))) as { webhook?: Webhook; secret?: string; error?: string };
    if (!res.ok || !body.webhook) return setError(body.error ?? "The webhook couldn't be added.");
    setHooks((h) => [...h, body.webhook!]);
    setSecret(body.secret ?? null);
    setUrl("");
  }

  async function remove(id: string) {
    setHooks((h) => h.filter((x) => x.id !== id));
    await fetch(`/api/agents/${agentId}/webhooks/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-5">
      {secret && (
        <div className="space-y-2 rounded-xl border border-good/30 bg-good-tint p-4">
          <p className="text-sm font-medium text-good">Your signing secret. Copy it now; it won&apos;t be shown again.</p>
          <CopyCode code={secret} label="Copy secret" />
          <p className="text-xs text-muted">
            Each call carries an <code className="font-mono">X-Keel-Signature</code> header: <code className="font-mono">sha256=</code> and the HMAC-SHA256 of the body with this secret.
          </p>
        </div>
      )}
      {hooks.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {hooks.map((h) => (
            <li key={h.id} className="flex items-start gap-3 px-4 py-3">
              <WebhookIcon className="mt-0.5 size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{h.url}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {h.events.map((e) => (
                    <Pill key={e}>{e}</Pill>
                  ))}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted">{h.lastAt ? `${h.lastStatus} · ${timeAgo(h.lastAt)}` : "Not called yet"}</span>
              <button type="button" onClick={() => void remove(h.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded-xl border border-line p-4">
        <label className="block">
          <span className="label">Address to call</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="field font-mono text-xs" placeholder="https://yourbusiness.com/hooks/keel" />
        </label>
        <div>
          <span className="label">When</span>
          <div className="space-y-1.5">
            {events.map((e) => (
              <label key={e.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={chosen.has(e.key)} onChange={(x) => setChosen((s) => (x.target.checked ? new Set([...s, e.key]) : new Set([...s].filter((k) => k !== e.key))))} className="accent-[var(--ink)]" />
                {e.text} <span className="font-mono text-xs text-subtle">{e.key}</span>
              </label>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => void add()} disabled={!url.trim() || !chosen.size} className="btn btn-primary">
          <Plus className="size-4" /> Add webhook
        </button>
        {error && <Notice>{error}</Notice>}
      </div>
    </div>
  );
}
