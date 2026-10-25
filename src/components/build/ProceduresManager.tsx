"use client";

import type { Industry } from "@/core/agents";
import { GOALS, INDUSTRY_GOALS } from "@/core/goals";
import { BusinessFilter } from "./BusinessFilter";
import { AtSign, ListOrdered, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PROCEDURE_TEMPLATES, actionsIn, type Procedure } from "@/core/procedures";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, Pill, Spinner, Toggle, timeAgo } from "../ui";

type Draft = { id?: string; name: string; trigger: string; steps: string; enabled: boolean };
const AREAS = [...new Set(PROCEDURE_TEMPLATES.map((t) => t.area))];

/**
 * Build › Procedures: step-by-step playbooks for one kind of request. The agent picks the one that fits the customer's
 * message and follows its steps, calling actions where a step says @name.
 */
export function ProceduresManager({ agentId, initial, actions, industry = "other" }: { industry?: Industry; agentId: string; initial: Procedure[]; actions: { name: string; title: string; enabled: boolean }[] }) {
  const [business, setBusiness] = useState<Industry>(industry);
  const [showAll, setShowAll] = useState(false);
  const recommended = new Set(INDUSTRY_GOALS[business].flatMap((key) => GOALS[key].procedures));
  const router = useRouter();
  const [procedures, setProcedures] = useState(initial);
  const [tab, setTab] = useState<"mine" | "templates">(initial.length ? "mine" : "templates");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(draft: Draft): Promise<string | null> {
    const res = await fetch(`/api/agents/${agentId}/procedures`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const body = (await res.json().catch(() => ({}))) as { procedure?: Procedure; error?: string };
    if (!res.ok || !body.procedure) return body.error ?? "It couldn't be saved.";
    const saved = body.procedure;
    setProcedures((all) => (all.some((p) => p.id === saved.id) ? all.map((p) => (p.id === saved.id ? saved : p)) : [...all, saved]));
    return null;
  }

  async function fromTemplate(index: number) {
    setAdding(index);
    const res = await fetch(`/api/agents/${agentId}/procedures/templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }) });
    const body = (await res.json().catch(() => ({}))) as { procedure?: Procedure; createdActions?: string[]; error?: string };
    setAdding(null);
    if (!res.ok || !body.procedure) return setNotice(body.error ?? "The template couldn't be added.");
    setProcedures((all) => [...all, body.procedure!]);
    setNotice(body.createdActions?.length ? `Added "${body.procedure.name}", with the actions it uses: ${body.createdActions.join(", ")}. Check their settings in Actions.` : `Added "${body.procedure.name}".`);
    setTab("mine");
    router.refresh();
  }

  async function remove(id: string) {
    setProcedures((all) => all.filter((p) => p.id !== id));
    await fetch(`/api/agents/${agentId}/procedures/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b border-line">
        {(
          [
            ["mine", `My procedures${procedures.length ? ` (${procedures.length})` : ""}`],
            ["templates", "Templates"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => setEditing({ name: "", trigger: "", steps: "1. ", enabled: true })} className="btn btn-primary mb-1.5 ml-auto px-3 py-1.5 text-xs">
          <Plus className="size-3.5" /> New procedure
        </button>
      </div>
      {notice && <Notice tone="good">{notice}</Notice>}

      {tab === "mine" &&
        (procedures.length === 0 ? (
          <EmptyState
            icon={<ListOrdered className="size-5" />}
            title="No procedures yet"
            text="Write the steps your best person would follow for a kind of request, or start from a template."
            action={
              <button type="button" onClick={() => setTab("templates")} className="btn btn-secondary">
                See templates
              </button>
            }
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {procedures.map((p) => {
              const missing = actionsIn(p.steps).filter((n) => !actions.some((a) => a.name === n));
              return (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => setEditing({ id: p.id, name: p.name, trigger: p.trigger, steps: p.steps, enabled: p.enabled })} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {p.name} {missing.length > 0 && <Pill tone="warn">Missing @{missing[0]}</Pill>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {p.trigger} · changed {timeAgo(p.updatedAt)}
                    </span>
                  </button>
                  <Toggle
                    checked={p.enabled}
                    onChange={(enabled) => {
                      setProcedures((all) => all.map((x) => (x.id === p.id ? { ...x, enabled } : x)));
                      void save({ id: p.id, name: p.name, trigger: p.trigger, steps: p.steps, enabled });
                    }}
                    label={`Turn ${p.name} on or off`}
                  />
                  <button type="button" onClick={() => void remove(p.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ))}

      {tab === "templates" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><BusinessFilter value={business} onChange={setBusiness} /><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />Show all templates</label></div>
          <p className="text-sm text-muted">{showAll ? "All guides, ready to adapt to your business." : "Recommended guides for this business type. Review the steps before using them."}</p>
          {AREAS.filter((area) => PROCEDURE_TEMPLATES.some((t) => t.area === area && (showAll || recommended.has(t.name)))).map((area) => (
            <div key={area}>
              <p className="eyebrow mb-2">{area}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {PROCEDURE_TEMPLATES.map((t, index) =>
                  t.area !== area || (!showAll && !recommended.has(t.name)) ? null : (
                    <div key={t.name} className="card flex flex-col p-5">
                      <p className="text-[15px] font-semibold">{t.name}</p>
                      <p className="mt-1 flex-1 text-sm text-muted">{t.text}</p>
                      <p className="mt-3 flex flex-wrap gap-1">
                        {t.needs.map((n) => (
                          <span key={n.name} className="rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[11px]">
                            @{n.name}
                          </span>
                        ))}
                      </p>
                      <button type="button" onClick={() => void fromTemplate(index)} disabled={adding !== null} className="btn btn-secondary mt-4 self-start px-3 py-1.5 text-xs">
                        {adding === index ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Use template
                      </button>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ProcedureEditor initial={editing} actions={actions} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function ProcedureEditor({
  initial,
  actions,
  onClose,
  onSave,
}: {
  initial: Draft;
  actions: { name: string; title: string; enabled: boolean }[];
  onClose: () => void;
  onSave: (d: Draft) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const steps = useRef<HTMLTextAreaElement>(null);
  const missing = actionsIn(draft.steps).filter((n) => !actions.some((a) => a.name === n));

  function insert(name: string) {
    const box = steps.current;
    const at = box?.selectionStart ?? draft.steps.length;
    const next = `${draft.steps.slice(0, at)}@${name}${draft.steps.slice(at)}`;
    setDraft({ ...draft, steps: next });
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at + name.length + 1, at + name.length + 1);
    });
  }

  async function save() {
    setSaving(true);
    const problem = await onSave(draft);
    setSaving(false);
    if (problem) setError(problem);
    else onClose();
  }

  return (
    <Dialog
      title={initial.id ? "Edit procedure" : "New procedure"}
      subtitle="Number the steps. Start a branch with “If …:” or “Otherwise:” and indent its steps beneath it."
      onClose={onClose}
      wide
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-sm">
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} label="Turned on" /> Turned on
          </label>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save procedure"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">Name</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="field" maxLength={80} placeholder="Where is my order" />
        </label>
        <label className="block">
          <span className="label">When it applies</span>
          <input value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value })} className="field" maxLength={500} placeholder="The customer asks where their order is or when it will arrive." />
          <span className="hint block">The agent compares each message with this sentence to pick the procedure.</span>
        </label>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">Steps</span>
            <span className="text-xs text-muted">Insert an action:</span>
          </div>
          {actions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {actions.map((a) => (
                <button key={a.name} type="button" onClick={() => insert(a.name)} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 font-mono text-[11px] hover:bg-panel-2" title={a.title}>
                  <AtSign className="size-3" />
                  {a.name}
                </button>
              ))}
            </div>
          )}
          <textarea ref={steps} value={draft.steps} onChange={(e) => setDraft({ ...draft, steps: e.target.value })} rows={12} spellCheck={false} className="field resize-y font-mono text-[13px] leading-relaxed" />
          {actions.length === 0 && <p className="hint mt-1">Add actions in Actions & widgets › Actions to call them from a step.</p>}
        </div>
        {missing.length > 0 && <Notice tone="warn">The agent has no action called {missing.map((m) => `@${m}`).join(", ")}. Add it in Actions, or the step will be skipped.</Notice>}
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
