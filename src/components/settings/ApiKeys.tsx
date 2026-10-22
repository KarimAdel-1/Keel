"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ApiKey } from "@/platform/apikeys";
import { CopyCode } from "../channel/CopyCode";
import { Notice, timeAgo } from "../ui";

/** The workspace's API keys: make one (shown once), see when each was last used, delete one. */
export function ApiKeys({ initial }: { initial: ApiKey[] }) {
  const [keys, setKeys] = useState(initial);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    const res = await fetch("/api/workspace/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "API key" }) });
    const body = (await res.json().catch(() => ({}))) as { key?: string; apiKey?: ApiKey; error?: string };
    if (!res.ok || !body.key || !body.apiKey) return setError(body.error ?? "The key couldn't be made.");
    setKeys((k) => [...k, body.apiKey!]);
    setFresh(body.key);
    setName("");
  }

  async function remove(id: string) {
    setKeys((k) => k.filter((x) => x.id !== id));
    await fetch(`/api/workspace/keys/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4">
      {fresh && (
        <div className="space-y-2 rounded-xl border border-good/30 bg-good-tint p-4">
          <p className="text-sm font-medium text-good">Copy your key now. For your safety it won&apos;t be shown again.</p>
          <CopyCode code={fresh} label="Copy key" />
        </div>
      )}
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="What it's for, like “Order system”" maxLength={80} />
        <button type="button" onClick={() => void create()} className="btn btn-primary shrink-0">
          <Plus className="size-4" /> Make a key
        </button>
      </div>
      {error && <Notice>{error}</Notice>}
      {keys.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <KeyRound className="size-4 text-muted" />
              <span className="font-medium">{k.name}</span>
              <span className="font-mono text-xs text-muted">{k.prefix}…</span>
              <span className="ml-auto text-xs text-muted">{k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : `made ${timeAgo(k.createdAt)}, not used yet`}</span>
              <button type="button" onClick={() => void remove(k.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete key">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
