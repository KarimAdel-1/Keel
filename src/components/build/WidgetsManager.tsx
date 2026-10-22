"use client";

import { LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { WIDGET_INFO, WIDGET_TEMPLATES, renderWidget, type WidgetDefinition, type WidgetMapping, type WidgetTemplate } from "@/core/widgets";
import { ChatWidget } from "../chat/ChatWidget";
import { chatVars } from "../chat/look";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, timeAgo } from "../ui";

export interface WidgetStarter {
  template: WidgetTemplate;
  name: string;
  mapping: WidgetMapping;
  sample: unknown;
}

/** Which parts of the mapping each template reads, with a word on each for the builder. */
const PARTS: Record<WidgetTemplate, { key: Exclude<keyof WidgetMapping, "columns">; label: string; hint: string }[]> = {
  cards: [
    { key: "items", label: "List of items", hint: "Where the list is in the response, like products or data.items" },
    { key: "title", label: "Name", hint: "In each item" },
    { key: "subtitle", label: "Description", hint: "In each item" },
    { key: "price", label: "Price", hint: "In each item" },
    { key: "image", label: "Picture link", hint: "In each item; https only" },
    { key: "link", label: "Page link", hint: "In each item" },
  ],
  tracker: [
    { key: "title", label: "Title", hint: "Like the order number" },
    { key: "steps", label: "Steps", hint: "A list of step names" },
    { key: "current", label: "Current step", hint: "Its name or its number" },
  ],
  slots: [
    { key: "items", label: "List of times", hint: "Where the list is in the response" },
    { key: "title", label: "Label", hint: "In each time; leave empty when the list is plain text" },
  ],
  table: [{ key: "items", label: "List of rows", hint: "Where the list is in the response" }],
  summary: [{ key: "title", label: "Title", hint: "Like the booking reference" }],
};

const hasColumns = (t: WidgetTemplate) => t === "table" || t === "summary";

/**
 * Build › Widgets: how the agent shows data from your systems in the chat. A widget turns a "Call your API" action's
 * response into cards, a tracker, time slots, a table or a summary, through paths into the response.
 */
export function WidgetsManager({ agentId, initial, starters, color }: { agentId: string; initial: WidgetDefinition[]; starters: WidgetStarter[]; color: string }) {
  const [widgets, setWidgets] = useState(initial);
  const [tab, setTab] = useState<"mine" | "create">(initial.length ? "mine" : "create");
  const [editing, setEditing] = useState<{ id?: string; template: WidgetTemplate; name: string; mapping: WidgetMapping; sample: string } | null>(null);

  async function remove(id: string) {
    setWidgets((w) => w.filter((x) => x.id !== id));
    await fetch(`/api/agents/${agentId}/widgets/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["mine", `My widgets${widgets.length ? ` (${widgets.length})` : ""}`],
            ["create", "Create a widget"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" &&
        (widgets.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="size-5" />}
            title="No widgets yet"
            text="Start from a ready-made one, then point it at what your system sends back."
            action={
              <button type="button" onClick={() => setTab("create")} className="btn btn-primary">
                <Plus className="size-4" /> Create a widget
              </button>
            }
          />
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {widgets.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setEditing({ id: w.id, template: w.template, name: w.name, mapping: w.mapping, sample: w.sample })} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-medium">{w.name}</span>
                  <span className="text-xs text-muted">
                    {WIDGET_INFO[w.template].name} · changed {timeAgo(w.updatedAt)}
                  </span>
                </button>
                <button type="button" onClick={() => void remove(w.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title="Delete">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === "create" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {starters.map((s) => {
            const preview = renderWidget(s, s.sample);
            return (
              <div key={s.name} className="card relative flex flex-col p-4 transition hover:border-ink/30">
                <div className="pointer-events-none mb-4 h-36 overflow-hidden rounded-xl border border-line p-3 text-[13px]" style={{ ...chatVars({ color, theme: "light", style: "classic" }), background: "var(--c-bg)", color: "var(--c-text)" }} inert>
                  {preview && <ChatWidget widget={preview} agentId={agentId} onSend={() => {}} />}
                </div>
                <p className="text-[15px] font-semibold">{s.name}</p>
                <p className="mt-1 text-sm text-muted">{WIDGET_INFO[s.template].text}</p>
                <button
                  type="button"
                  onClick={() => setEditing({ template: s.template, name: s.name, mapping: s.mapping, sample: JSON.stringify(s.sample, null, 2) })}
                  className="absolute inset-0 rounded-[inherit]"
                  aria-label={`Start from ${s.name}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <WidgetEditor
          agentId={agentId}
          color={color}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(w) => {
            setWidgets((all) => (all.some((x) => x.id === w.id) ? all.map((x) => (x.id === w.id ? w : x)) : [...all, w]));
            setEditing(null);
            setTab("mine");
          }}
        />
      )}
    </div>
  );
}

function WidgetEditor({
  agentId,
  color,
  initial,
  onClose,
  onSaved,
}: {
  agentId: string;
  color: string;
  initial: { id?: string; template: WidgetTemplate; name: string; mapping: WidgetMapping; sample: string };
  onClose: () => void;
  onSaved: (w: WidgetDefinition) => void;
}) {
  const [template, setTemplate] = useState(initial.template);
  const [name, setName] = useState(initial.name);
  const [mapping, setMapping] = useState<WidgetMapping>(initial.mapping);
  const [sample, setSample] = useState(initial.sample);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    try {
      const widget = renderWidget({ template, mapping }, JSON.parse(sample || "null"));
      return widget ? { widget } : { problem: "Nothing to show yet: check the paths match the example response." };
    } catch {
      return { problem: "The example response isn't valid JSON." };
    }
  }, [template, mapping, sample]);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id, template, name, mapping, sample }),
    });
    const body = (await res.json().catch(() => ({}))) as { widget?: WidgetDefinition; error?: string };
    setSaving(false);
    if (!res.ok || !body.widget) return setError(body.error ?? "It couldn't be saved.");
    onSaved(body.widget);
  }

  const columns = mapping.columns ?? [];
  return (
    <Dialog
      title={initial.id ? "Edit widget" : "New widget"}
      subtitle="Paste an example of what your system sends back, then say where each part is."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">{saving ? "Saving…" : "Save widget"}</button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field" maxLength={80} />
            </label>
            <label className="block">
              <span className="label">Shown as</span>
              <select value={template} onChange={(e) => setTemplate(e.target.value as WidgetTemplate)} className="field">
                {WIDGET_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {WIDGET_INFO[t].name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Example response</span>
            <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={8} spellCheck={false} className="field resize-y font-mono text-xs" />
          </label>
          <div>
            <span className="label">Where each part is</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {PARTS[template].map((p) => (
                <label key={p.key} className="block">
                  <span className="text-xs font-medium">{p.label}</span>
                  <input value={mapping[p.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [p.key]: e.target.value || undefined })} className="field font-mono text-xs" placeholder={p.hint} />
                </label>
              ))}
            </div>
          </div>
          {hasColumns(template) && (
            <div>
              <span className="label">{template === "table" ? "Columns" : "Rows"}</span>
              <div className="space-y-2">
                {columns.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input value={c.label} onChange={(e) => setMapping({ ...mapping, columns: columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="field" placeholder="Label" />
                    <input value={c.path} onChange={(e) => setMapping({ ...mapping, columns: columns.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)) })} className="field font-mono text-xs" placeholder="Path, like price.amount" />
                    <button type="button" onClick={() => setMapping({ ...mapping, columns: columns.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Remove">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setMapping({ ...mapping, columns: [...columns, { label: "", path: "" }] })} className="btn btn-secondary px-3 py-1.5 text-xs">
                  <Plus className="size-3.5" /> Add {template === "table" ? "a column" : "a row"}
                </button>
              </div>
            </div>
          )}
          {error && <Notice>{error}</Notice>}
        </div>
        <div>
          <span className="label">Preview</span>
          <div className="rounded-xl border border-line p-4 text-[13px]" style={{ ...chatVars({ color, theme: "light", style: "classic" }), background: "var(--c-bg)", color: "var(--c-text)" }}>
            {"widget" in preview && preview.widget ? <ChatWidget widget={preview.widget} agentId={agentId} onSend={() => {}} /> : <p className="text-xs text-muted">{preview.problem}</p>}
          </div>
          <p className="hint mt-2">To use it, pick it in a &quot;Call your API&quot; action under &quot;Show the result as a widget&quot;.</p>
        </div>
      </div>
    </Dialog>
  );
}
