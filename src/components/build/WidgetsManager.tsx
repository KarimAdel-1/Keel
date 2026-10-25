"use client";

import { LayoutTemplate, Plus, Trash2 } from "lucide-react";
import type { Industry } from "@/core/agents";
import { BUSINESS_WIDGETS } from "./business-templates";
import { BusinessFilter } from "./BusinessFilter";
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
export function WidgetsManager({
  agentId,
  initial,
  starters,
  color,
  industry = "other",
}: {
  agentId: string;
  initial: WidgetDefinition[];
  starters: WidgetStarter[];
  color: string;
  industry?: Industry;
}) {
  const [widgets, setWidgets] = useState(initial);
  const [business, setBusiness] = useState<Industry>(industry);
  const [tab, setTab] = useState<"mine" | "create">(initial.length ? "mine" : "create");
  const [editing, setEditing] = useState<{ id?: string; template: WidgetTemplate; name: string; mapping: WidgetMapping; sample: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/widgets/${id}`, { method: "DELETE" }).catch(() => undefined);
    if (!res?.ok) return setError("The widget could not be deleted. Please try again.");
    setWidgets((w) => w.filter((x) => x.id !== id));
  }
  const create = () =>
    setEditing({
      template: "summary",
      name: "My widget",
      mapping: { title: "title", columns: [{ label: "Status", path: "status" }] },
      sample: JSON.stringify({ title: "Your request", status: "Received" }, null, 2),
    });
  const previewCard = (s: WidgetStarter) => {
    const preview = renderWidget(s, s.sample);
    return (
      <article key={s.name} className="card flex flex-col overflow-hidden">
        <div
          className="pointer-events-none h-56 overflow-hidden border-b border-line bg-panel-2/50 p-4 text-[13px]"
          style={{ ...chatVars({ color: "#465977", theme: "light", style: "classic" }), color: "var(--c-text)" }}
          inert
        >
          {preview && <ChatWidget widget={preview} agentId={agentId} onSend={() => {}} />}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{s.name}</h3>
            <span className="neutral-label">Widget</span>
          </div>
          <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{WIDGET_INFO[s.template].text}</p>
          <button
            type="button"
            onClick={() => setEditing({ template: s.template, name: s.name, mapping: s.mapping, sample: JSON.stringify(s.sample, null, 2) })}
            className="btn btn-secondary mt-4 self-start text-xs"
          >
            Customize template
          </button>
        </div>
      </article>
    );
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Widgets</h1>
          <p className="mt-1 text-sm text-muted">Turn answers into cards, progress updates and useful choices.</p>
        </div>
        <button type="button" onClick={create} className="btn btn-primary">
          <Plus className="size-4" /> Create your own widget
        </button>
      </div>
      <div className="flex gap-4 border-b border-line" role="tablist" aria-label="Widgets">
        {(
          [
            ["mine", `My widgets (${widgets.length})`],
            ["create", "Template library"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault();
              const next = e.key === "Home" ? "mine" : e.key === "End" ? "create" : tab === "mine" ? "create" : "mine";
              setTab(next);
              const buttons = e.currentTarget.parentElement?.querySelectorAll("button");
              buttons?.[next === "mine" ? 0 : 1]?.focus();
            }}
            aria-selected={tab === key}
            aria-controls={`widgets-${key}`}
            id={`widget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-1 py-3 text-sm ${tab === key ? "border-ink font-medium" : "border-transparent text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <Notice>{error}</Notice>}
      {tab === "mine" && (
        <div role="tabpanel" id="widgets-mine" aria-labelledby="widget-tab-mine">
          {widgets.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {widgets.map((w) => {
                let preview;
                try {
                  preview = renderWidget(w, JSON.parse(w.sample));
                } catch {
                  /* A saved widget may not have sample data. */
                }
                return (
                  <article key={w.id} className="card overflow-hidden">
                    <div
                      className="pointer-events-none h-56 overflow-hidden border-b border-line bg-panel-2/50 p-4"
                      style={{ ...chatVars({ color: "#465977", theme: "light", style: "classic" }), color: "var(--c-text)" }}
                      inert
                    >
                      {preview ? (
                        <ChatWidget widget={preview} agentId={agentId} onSend={() => {}} />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted">Add sample data to preview</div>
                      )}
                    </div>
                    <div className="p-5">
                      <span className="neutral-label">{WIDGET_INFO[w.template].name}</span>
                      <h3 className="mt-3 text-sm font-semibold">{w.name}</h3>
                      <p className="mt-1 text-xs text-muted">Updated {timeAgo(w.updatedAt)}</p>
                      <div className="mt-4 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setEditing({ id: w.id, template: w.template, name: w.name, mapping: w.mapping, sample: w.sample })}
                          className="btn btn-secondary text-xs"
                        >
                          Edit widget
                        </button>
                        <button type="button" onClick={() => void remove(w.id)} className="btn btn-ghost" aria-label={`Delete ${w.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<LayoutTemplate className="size-5" />}
              title="Your first widget starts here"
              text="Customize a template or create your own layout using the supported building blocks."
              action={
                <button type="button" onClick={() => setTab("create")} className="btn btn-secondary">
                  Browse templates
                </button>
              }
            />
          )}
        </div>
      )}
      {tab === "create" && (
        <div role="tabpanel" id="widgets-create" aria-labelledby="widget-tab-create" className="space-y-6">
          <BusinessFilter value={business} onChange={setBusiness} />
          <section>
            <h2 className="mb-3 text-sm font-semibold">For your business</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {BUSINESS_WIDGETS[business].map(previewCard)}
              <article className="card flex flex-col items-start justify-center border-dashed p-6">
                <Plus className="mb-5 size-7 text-muted" />
                <span className="neutral-label">Custom widget</span>
                <h3 className="mt-3 font-semibold">Make it your own</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">Choose a layout, edit its content and preview the result.</p>
                <button type="button" onClick={create} className="btn btn-secondary mt-5">
                  Create widget
                </button>
              </article>
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">All layouts</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{starters.map(previewCard)}</div>
          </section>
        </div>
      )}
      {editing && (
        <WidgetEditor
          key={editing.id ?? editing.name}
          agentId={agentId}
          color={color}
          initial={editing}
          starters={starters}
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
  starters,
  onClose,
  onSaved,
}: {
  agentId: string;
  color: string;
  starters: WidgetStarter[];
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
      subtitle="Choose a layout, edit the sample content, and preview the result. Connect live data in an API action."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save widget"}
          </button>
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
              <select
                value={template}
                onChange={(e) => {
                  const next = e.target.value as WidgetTemplate;
                  setTemplate(next);
                  const starter = starters.find((s) => s.template === next);
                  if (starter) {
                    setMapping(starter.mapping);
                    setSample(JSON.stringify(starter.sample, null, 2));
                  }
                }}
                className="field"
              >
                {WIDGET_TEMPLATES.map((t) => (
                  <option key={t} value={t}>
                    {WIDGET_INFO[t].name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="hint">Changing the layout replaces the sample content and field connections.</p>
          <section className="rounded-xl border border-line p-4">
            <h3 className="mb-3 text-sm font-semibold">Sample content</h3>
            <SampleContent
              sample={sample}
              onChange={setSample}
              labels={Object.fromEntries([...(mapping.columns ?? []).map((c) => [c.path, c.label]), [mapping.title ?? "title", "Title"]])}
            />
          </section>
          {template === "summary" && (
            <section className="rounded-xl border border-line p-4">
              <h3 className="mb-3 text-sm font-semibold">Fields on your card</h3>
              <div className="space-y-2">
                {columns.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      aria-label={`Field ${i + 1} label`}
                      className="field text-sm"
                      value={c.label}
                      onChange={(e) => setMapping({ ...mapping, columns: columns.map((x, j) => (i === j ? { ...x, label: e.target.value } : x)) })}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${c.label} field`}
                      className="btn btn-ghost"
                      onClick={() => setMapping({ ...mapping, columns: columns.filter((_, j) => i !== j) })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary mt-3 text-xs"
                onClick={() => {
                  try {
                    const data = JSON.parse(sample);
                    if (!data || Array.isArray(data) || typeof data !== "object") {
                      setError("Use an object as sample data to add a card field.");
                      return;
                    }
                    let index = columns.length + 1;
                    while (`field_${index}` in data) index++;
                    const key = `field_${index}`;
                    setMapping({ ...mapping, columns: [...columns, { label: "New field", path: key }] });
                    setSample(JSON.stringify({ ...data, [key]: "Your value" }, null, 2));
                  } catch {
                    setError("Fix the sample data before adding a field.");
                  }
                }}
              >
                <Plus className="size-3.5" /> Add field
              </button>
            </section>
          )}
          <details className="report-detail">
            <summary>Connect data · advanced</summary>
            <label className="block">
              <span className="label">Example response (JSON)</span>
              <textarea value={sample} onChange={(e) => setSample(e.target.value)} rows={8} spellCheck={false} className="field resize-y font-mono text-xs" />
            </label>
            <div>
              <span className="label">Where each part is</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {PARTS[template].map((p) => (
                  <label key={p.key} className="block">
                    <span className="text-xs font-medium">{p.label}</span>
                    <input
                      value={mapping[p.key] ?? ""}
                      onChange={(e) => setMapping({ ...mapping, [p.key]: e.target.value || undefined })}
                      className="field font-mono text-xs"
                      placeholder={p.hint}
                    />
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
                      <input
                        value={c.label}
                        onChange={(e) => setMapping({ ...mapping, columns: columns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                        className="field"
                        placeholder="Label"
                      />
                      <input
                        value={c.path}
                        onChange={(e) => setMapping({ ...mapping, columns: columns.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)) })}
                        className="field font-mono text-xs"
                        placeholder="Path, like price.amount"
                      />
                      <button
                        type="button"
                        onClick={() => setMapping({ ...mapping, columns: columns.filter((_, j) => j !== i) })}
                        className="rounded-md p-1.5 text-muted hover:bg-panel-2"
                        title="Remove"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMapping({ ...mapping, columns: [...columns, { label: "", path: "" }] })}
                    className="btn btn-secondary px-3 py-1.5 text-xs"
                  >
                    <Plus className="size-3.5" /> Add {template === "table" ? "a column" : "a row"}
                  </button>
                </div>
              </div>
            )}
          </details>
          {error && <Notice>{error}</Notice>}
        </div>
        <div>
          <span className="label">Live preview · sample data</span>
          <div
            className="rounded-xl border border-line p-4 text-[13px]"
            style={{ ...chatVars({ color, theme: "light", style: "classic" }), background: "var(--c-bg)", color: "var(--c-text)" }}
          >
            {"widget" in preview && preview.widget ? (
              <ChatWidget widget={preview.widget} agentId={agentId} onSend={() => {}} />
            ) : (
              <p className="text-xs text-muted">{preview.problem}</p>
            )}
          </div>
          <p className="hint mt-2">To use it, pick it in a &quot;Call your API&quot; action under &quot;Show the result as a widget&quot;.</p>
        </div>
      </div>
    </Dialog>
  );
}

/** Edits the existing JSON sample through labelled fields; the saved schema stays unchanged. */
function SampleContent({ sample, onChange, labels }: { sample: string; onChange: (value: string) => void; labels: Record<string, string> }) {
  let data: unknown;
  try {
    data = JSON.parse(sample);
  } catch {
    return <p className="text-sm text-muted">Fix the sample JSON under Connect data to use the visual editor.</p>;
  }
  const update = (path: (string | number)[], value: unknown) => {
    const next = structuredClone(data);
    if (!path.length) {
      onChange(JSON.stringify(value, null, 2));
      return;
    }
    let at = next as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
    at[path[path.length - 1]] = value;
    onChange(JSON.stringify(next, null, 2));
  };
  const fields = (value: unknown, path: (string | number)[] = [], depth = 0): React.ReactNode => {
    if (depth > 5) return <p className="text-xs text-muted">Edit nested content under Connect data.</p>;
    if (Array.isArray(value))
      return (
        <div className="space-y-3">
          {value.map((v, i) => (
            <div key={i} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium">Item {i + 1}</span>
                <button
                  type="button"
                  className="text-xs text-muted underline"
                  onClick={() =>
                    update(
                      path,
                      value.filter((_, j) => i !== j),
                    )
                  }
                >
                  Remove item {i + 1}
                </button>
              </div>
              {fields(v, [...path, i], depth + 1)}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary text-xs"
            onClick={() => update(path, [...value, value.length ? structuredClone(value[value.length - 1]) : "New item"])}
          >
            Add item
          </button>
        </div>
      );
    if (value !== null && typeof value === "object")
      return (
        <div className="space-y-3">
          {Object.entries(value).map(([k, v]) => (
            <div key={k}>
              <p className="mb-1 text-xs font-medium capitalize">{labels[[...path, k].join(".")] ?? k.replace(/_/g, " ")}</p>
              {fields(v, [...path, k], depth + 1)}
            </div>
          ))}
        </div>
      );
    const label = labels[path.join(".")] ?? (path.join(" / ") || "Content");
    if (typeof value === "boolean")
      return (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={value} onChange={(e) => update(path, e.target.checked)} />
          {label}
        </label>
      );
    return (
      <input
        aria-label={label}
        className="field text-sm"
        type={typeof value === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => update(path, typeof value === "number" ? Number(e.target.value) : e.target.value)}
      />
    );
  };
  return fields(data);
}
