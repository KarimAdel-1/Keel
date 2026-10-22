"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Notice } from "../ui";

const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** The workspace's own contact fields (plan, account number, city…), shown on every contact and filled by imports. */
export function ContactFields({ initial }: { initial: { key: string; label: string }[] }) {
  const [fields, setFields] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const dirty = JSON.stringify(fields) !== saved;

  async function save() {
    const clean = fields.filter((f) => f.label.trim()).map((f) => ({ label: f.label.trim(), key: f.key || keyOf(f.label) }));
    const res = await fetch("/api/workspace/contacts/fields", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: clean }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMessage({ tone: "bad", text: body.error ?? "The fields couldn't be saved." });
    setFields(clean);
    setSaved(JSON.stringify(clean));
    setMessage({ tone: "good", text: "Saved." });
  }

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={f.label}
            onChange={(e) => setFields(fields.map((x, j) => (j === i ? { label: e.target.value, key: initial.some((s) => s.key === x.key) ? x.key : keyOf(e.target.value) } : x)))}
            className="field"
            placeholder="Like “Plan” or “Account number”"
            maxLength={60}
          />
          <span className="w-40 shrink-0 truncate font-mono text-xs text-muted">{f.key || keyOf(f.label) || "key"}</span>
          <button type="button" onClick={() => setFields(fields.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Remove">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => setFields([...fields, { key: "", label: "" }])} className="btn btn-secondary">
          <Plus className="size-4" /> Add a field
        </button>
        {dirty && (
          <button type="button" onClick={() => void save()} className="btn btn-primary">
            Save fields
          </button>
        )}
      </div>
      <p className="hint">In a CSV import, a column whose header matches the key fills the field.</p>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
