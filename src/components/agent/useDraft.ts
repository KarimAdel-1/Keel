"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { changeOnly, type AgentConfigChange } from "@/core/agents";

/**
 * Settings being edited: the draft, whether it differs from what's saved, and saving it. Leaving the page with
 * unsaved changes asks first.
 */
export function useDraft<T extends Record<string, unknown>>(agentId: string, saved: T, toChange: (draft: T) => { name?: string; config?: AgentConfigChange }) {
  const router = useRouter();
  const [base, setBase] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    // Only what this person changed: someone else's edits to other settings in the meantime stay.
    const change = changeOnly(toChange(draft), toChange(base));
    if (!Object.keys(change).length) return setBase(draft);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }).catch(() => undefined);
    setSaving(false);
    if (!res?.ok) {
      setError(((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error ?? "Your changes couldn't be saved. Try again.");
      return;
    }
    setBase(draft);
    router.refresh();
  }

  const set = (patch: Partial<T>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  return { draft, set, dirty, saving, error, save, discard: () => (setDraft(base), setError(null)) };
}
