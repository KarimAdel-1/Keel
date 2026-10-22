import type { ReactNode } from "react";

/** One group of settings: a title, what it changes in plain words, then the fields. */
export function Section({ title, description, aside, children }: { title: string; description?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Unsaved changes: what's different, and the two ways out. */
export function SaveBar({ saving, error, onSave, onDiscard, note }: { saving: boolean; error?: string | null; onSave: () => void; onDiscard: () => void; note: string }) {
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-strong bg-panel px-4 py-3 shadow-raised">
      <p className={`text-sm ${error ? "text-bad" : "text-muted"}`}>{error ?? note}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onDiscard} disabled={saving} className="btn btn-secondary">Discard</button>
        <button type="button" onClick={onSave} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </div>
  );
}
