"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "../ui";

/** The workspace's name, editable by its owner and admins. */
export function WorkspaceName({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(body.error ?? "The name couldn't be saved.");
    setSaved(name.trim());
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} className="field" maxLength={80} />
        {name.trim() !== saved && (
          <button type="button" onClick={() => void save()} className="btn btn-primary shrink-0">
            Save
          </button>
        )}
      </div>
      {!canEdit && <p className="hint">Only the owner or an admin can rename it.</p>}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
