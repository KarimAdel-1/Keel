"use client";

import { Bot, Code2, FileText, Link2, ListChecks, MessageSquarePlus, Plus, Trash2, UserRoundCheck, Users, Zap } from "lucide-react";
import type { Industry } from "@/core/agents";
import { ACTION_STARTERS, type ActionStarter } from "./business-templates";
import { BusinessFilter } from "./BusinessFilter";
import { useState } from "react";
import { ACTION_INFO, ACTION_KINDS, type Action, type ActionConfigs, type ActionKind, type ApiParam } from "@/core/actions";
import type { FieldSpec } from "@/core/widgets";
import { Dialog } from "../Dialog";
import { Notice, Pill, Spinner, Toggle } from "../ui";

const ICON: Record<ActionKind, typeof Zap> = {
  escalate: UserRoundCheck,
  handoff: Users,
  api: Code2,
  lead: Bot,
  data: ListChecks,
  form: FileText,
  button: Link2,
  followups: MessageSquarePlus,
};
const GROUPS = [...new Set(ACTION_KINDS.map((k) => ACTION_INFO[k].group))];

/**
 * Build › Actions: what the agent can do besides answering. The ones it has, each on or off, and the catalogue to add
 * more, grouped like the work they do. Each opens an editor with its own settings.
 */
export function ActionsManager({
  agentId,
  initial,
  widgets,
  industry = "other",
}: {
  industry?: Industry;
  agentId: string;
  initial: Action[];
  widgets: { id: string; name: string }[];
}) {
  const [business, setBusiness] = useState<Industry>(industry);
  const [actions, setActions] = useState(initial);
  const [editing, setEditing] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<ActionKind | null>(null);

  async function add(kind: ActionKind, preset?: ActionStarter) {
    setAdding(kind);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = (await res.json().catch(() => ({}))) as { action?: Action; error?: string };
    setAdding(null);
    if (!res.ok || !body.action) return setError(body.error ?? "The action couldn't be added.");
    setActions((a) => [...a, body.action!]);
    setEditing(
      preset
        ? { ...body.action, title: preset.title, description: preset.description, config: { ...body.action.config, ...preset.config } as Action["config"] }
        : body.action,
    );
  }

  async function toggle(action: Action, enabled: boolean) {
    setActions((all) => all.map((a) => (a.id === action.id ? { ...a, enabled } : a)));
    await fetch(`/api/agents/${agentId}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  return (
    <div className="space-y-8">
      {error && <Notice>{error}</Notice>}
      {actions.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Your actions</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {actions.map((a) => {
              const Icon = ICON[a.kind];
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-panel-2">
                    <Icon className="size-4" />
                  </span>
                  <button type="button" onClick={() => setEditing(a)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {a.title} {a.proceduresOnly && <Pill>Only in procedures</Pill>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      <span className="font-mono">{a.kind === "followups" ? "after each answer" : `@${a.name}`}</span> · {a.description}
                    </span>
                  </button>
                  <Toggle checked={a.enabled} onChange={(on) => void toggle(a, on)} label={`Turn ${a.title} on or off`} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Templates for your business</h2>
          <p className="mt-1 text-sm text-muted">Start with a common task, then review its settings. API actions need your own connection.</p>
        </div>
        <BusinessFilter value={business} onChange={setBusiness} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ACTION_STARTERS[business].map((preset) => {
            const Icon = ICON[preset.kind];
            return (
              <article key={preset.title} className="card flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-muted" />
                  <span className="neutral-label">Action template</span>
                </div>
                <h3 className="mt-5 text-sm font-semibold">{preset.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{preset.description}</p>
                <button
                  type="button"
                  disabled={adding !== null}
                  onClick={() => void add(preset.kind, preset)}
                  className="btn btn-secondary mt-5 self-start text-xs"
                >
                  {adding === preset.kind && <Spinner />} Use template
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">All action types</h2>
        <p className="mb-4 text-sm text-muted">The agent decides when to use each one, from the sentence you write about it.</p>
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="eyebrow mb-2">{group}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ACTION_KINDS.filter((k) => ACTION_INFO[k].group === group).map((k) => {
                  const Icon = ICON[k];
                  return (
                    <div key={k} className="card flex flex-col p-5">
                      <span className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2">
                        <Icon className="size-[18px]" />
                      </span>
                      <p className="mt-4 text-[15px] font-semibold">{ACTION_INFO[k].title}</p>
                      <p className="mt-1 flex-1 text-sm text-muted">{ACTION_INFO[k].text}</p>
                      <button
                        type="button"
                        onClick={() => void add(k)}
                        disabled={adding !== null}
                        className="btn btn-secondary mt-4 self-start px-3 py-1.5 text-xs"
                      >
                        {adding === k ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} Add
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <ActionEditor
          agentId={agentId}
          action={editing}
          widgets={widgets}
          onClose={() => setEditing(null)}
          onSaved={(a) => setActions((all) => all.map((x) => (x.id === a.id ? a : x)))}
          onDeleted={(id) => {
            setActions((all) => all.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function FieldsEditor({ fields, onChange }: { fields: FieldSpec[]; onChange: (f: FieldSpec[]) => void }) {
  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_auto_auto] items-center gap-2">
          <input
            value={f.label}
            onChange={(e) =>
              onChange(
                fields.map((x, j) =>
                  j === i
                    ? {
                        ...x,
                        label: e.target.value,
                        key:
                          x.key ||
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "_")
                            .slice(0, 40),
                      }
                    : x,
                ),
              )
            }
            className="field"
            placeholder="Label"
          />
          <select
            value={f.type}
            onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldSpec["type"] } : x)))}
            className="field"
          >
            <option value="text">Short text</option>
            <option value="long">Long text</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="choice">Choice</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => onChange(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))}
              className="accent-[var(--ink)]"
            />
            Required
          </label>
          <button
            type="button"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
            className="rounded-md p-1.5 text-muted hover:bg-panel-2"
            title="Remove"
          >
            <Trash2 className="size-4" />
          </button>
          {f.type === "choice" && (
            <input
              value={(f.options ?? []).join(", ")}
              onChange={(e) =>
                onChange(
                  fields.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          options: e.target.value
                            .split(",")
                            .map((o) => o.trim())
                            .filter(Boolean),
                        }
                      : x,
                  ),
                )
              }
              className="field col-span-4"
              placeholder="Options, separated by commas"
            />
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...fields, { key: `field_${fields.length + 1}`, label: "", type: "text", required: false }])}
        className="btn btn-secondary px-3 py-1.5 text-xs"
      >
        <Plus className="size-3.5" /> Add a field
      </button>
    </div>
  );
}

function ActionEditor({
  agentId,
  action,
  widgets,
  onClose,
  onSaved,
  onDeleted,
}: {
  agentId: string;
  action: Action;
  widgets: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (a: Action) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(action.title);
  const [name, setName] = useState(action.name);
  const [description, setDescription] = useState(action.description);
  const [proceduresOnly, setProceduresOnly] = useState(action.proceduresOnly);
  const [config, setConfig] = useState<Record<string, unknown>>(action.config as unknown as Record<string, unknown>);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const set = (patch: Record<string, unknown>) => setConfig((c) => ({ ...c, ...patch }));
  const kind = action.kind;

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, name, description, proceduresOnly, config }),
    });
    const body = (await res.json().catch(() => ({}))) as { action?: Action; error?: string };
    setSaving(false);
    if (!res.ok || !body.action) return setError(body.error ?? "It couldn't be saved.");
    onSaved(body.action);
    onClose();
  }

  async function remove() {
    await fetch(`/api/agents/${agentId}/actions/${action.id}`, { method: "DELETE" });
    onDeleted(action.id);
  }

  async function testCall() {
    setTesting(true);
    setTestResult(null);
    await fetch(`/api/agents/${agentId}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    const res = await fetch(`/api/agents/${agentId}/actions/${action.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args: testArgs }),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: number; body?: unknown; ms?: number; error?: string };
    setTesting(false);
    setTestResult(body.error ? `✕ ${body.error}` : `${body.status} in ${body.ms} ms\n${JSON.stringify(body.body, null, 2).slice(0, 3000)}`);
  }

  const api = config as unknown as ActionConfigs["api"];
  return (
    <Dialog
      title={ACTION_INFO[kind].title}
      subtitle={ACTION_INFO[kind].text}
      onClose={onClose}
      wide={kind === "api"}
      footer={
        <>
          <button type="button" onClick={() => void remove()} className="btn btn-ghost mr-auto text-bad">
            <Trash2 className="size-4" /> Remove
          </button>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {kind !== "followups" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Name</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" maxLength={80} />
            </label>
            <label className="block">
              <span className="label">Name in procedures</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field font-mono" maxLength={40} />
              <span className="hint block">Write @{name || "name"} in a procedure step to use it.</span>
            </label>
          </div>
        )}
        {kind !== "followups" && (
          <label className="block">
            <span className="label">When to use it</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="field resize-y" maxLength={1000} />
            <span className="hint block">The agent reads this to decide. Be specific: what the customer says or needs.</span>
          </label>
        )}

        {kind === "escalate" && (
          <label className="block">
            <span className="label">What the agent tells the customer</span>
            <input value={String(config.confirmation ?? "")} onChange={(e) => set({ confirmation: e.target.value })} className="field" maxLength={500} />
          </label>
        )}
        {kind === "handoff" && (
          <label className="block">
            <span className="label">What the agent says when it hands over</span>
            <input value={String(config.message ?? "")} onChange={(e) => set({ message: e.target.value })} className="field" maxLength={500} />
            <span className="hint block">Your team replies from the Helpdesk inbox; the customer sees their replies in the same chat.</span>
          </label>
        )}
        {kind === "api" && (
          <>
            <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <select value={api.method} onChange={(e) => set({ method: e.target.value })} className="field">
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input
                value={api.url}
                onChange={(e) => set({ url: e.target.value })}
                className="field font-mono text-xs"
                placeholder="https://api.yourbusiness.com/orders/{order_number}"
              />
            </div>
            <p className="hint -mt-3">Put a parameter in the URL as {"{name}"}; the others go in the query (GET) or the JSON body.</p>
            <div>
              <span className="label">Parameters the agent fills in</span>
              <div className="space-y-2">
                {api.params.map((p, i) => (
                  <div key={i} className="grid grid-cols-[140px_100px_1fr_auto_auto] items-center gap-2">
                    <input
                      value={p.name}
                      onChange={(e) => set({ params: api.params.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                      className="field font-mono text-xs"
                      placeholder="name"
                    />
                    <select
                      value={p.type}
                      onChange={(e) => set({ params: api.params.map((x, j) => (j === i ? { ...x, type: e.target.value as ApiParam["type"] } : x)) })}
                      className="field"
                    >
                      <option value="string">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Yes/no</option>
                    </select>
                    <input
                      value={p.description}
                      onChange={(e) => set({ params: api.params.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })}
                      className="field"
                      placeholder="What it is, for the agent"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(e) => set({ params: api.params.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)) })}
                        className="accent-[var(--ink)]"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => set({ params: api.params.filter((_, j) => j !== i) })}
                      className="rounded-md p-1.5 text-muted hover:bg-panel-2"
                      title="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set({ params: [...api.params, { name: "", type: "string", description: "", required: false }] })}
                  className="btn btn-secondary px-3 py-1.5 text-xs"
                >
                  <Plus className="size-3.5" /> Add a parameter
                </button>
              </div>
            </div>
            <div>
              <span className="label">Headers</span>
              <div className="space-y-2">
                {api.headers.map((h, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                    <input
                      value={h.name}
                      onChange={(e) => set({ headers: api.headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                      className="field font-mono text-xs"
                      placeholder="Authorization"
                    />
                    <input
                      value={h.value}
                      onChange={(e) => set({ headers: api.headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                      className="field font-mono text-xs"
                      placeholder="Bearer …"
                      type="password"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => set({ headers: api.headers.filter((_, j) => j !== i) })}
                      className="rounded-md p-1.5 text-muted hover:bg-panel-2"
                      title="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => set({ headers: [...api.headers, { name: "", value: "" }] })}
                  className="btn btn-secondary px-3 py-1.5 text-xs"
                >
                  <Plus className="size-3.5" /> Add a header
                </button>
              </div>
            </div>
            <label className="block">
              <span className="label">Show the result as a widget</span>
              <select value={api.widgetId ?? ""} onChange={(e) => set({ widgetId: e.target.value || undefined })} className="field">
                <option value="">No widget: the agent answers in words</option>
                {widgets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <span className="hint block">Create and edit these on the Widgets page, under Actions & widgets.</span>
            </label>
            <div className="rounded-xl border border-line bg-panel-2/50 p-4">
              <p className="text-sm font-semibold">Test call</p>
              <p className="mb-3 text-xs text-muted">Calls your system for real with these values, so you can check it before the agent uses it.</p>
              <div className="flex flex-wrap gap-2">
                {api.params
                  .filter((p) => p.name)
                  .map((p) => (
                    <input
                      key={p.name}
                      value={testArgs[p.name] ?? ""}
                      onChange={(e) => setTestArgs({ ...testArgs, [p.name]: e.target.value })}
                      className="field w-44"
                      placeholder={p.name}
                    />
                  ))}
                <button type="button" onClick={() => void testCall()} disabled={testing} className="btn btn-secondary">
                  {testing && <Spinner />} Send test call
                </button>
              </div>
              {testResult && <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-[#16171a] p-3 font-mono text-[11px] text-[#e6e7ea]">{testResult}</pre>}
            </div>
          </>
        )}
        {kind === "lead" && (
          <>
            <label className="block">
              <span className="label">Form title</span>
              <input value={String(config.title ?? "")} onChange={(e) => set({ title: e.target.value })} className="field" maxLength={120} />
            </label>
            <div>
              <span className="label">What to ask for</span>
              <div className="flex flex-wrap gap-3">
                {(["name", "email", "phone", "company"] as const).map((f) => {
                  const fields = (config.fields as string[]) ?? [];
                  return (
                    <label key={f} className="flex items-center gap-2 text-sm capitalize">
                      <input
                        type="checkbox"
                        checked={fields.includes(f)}
                        onChange={(e) => set({ fields: e.target.checked ? [...fields, f] : fields.filter((x) => x !== f) })}
                        className="accent-[var(--ink)]"
                      />
                      {f}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {(kind === "data" || kind === "form") && (
          <>
            <label className="block">
              <span className="label">Form title</span>
              <input value={String(config.title ?? "")} onChange={(e) => set({ title: e.target.value })} className="field" maxLength={120} />
            </label>
            <div>
              <span className="label">Fields</span>
              <FieldsEditor fields={(config.fields as FieldSpec[]) ?? []} onChange={(fields) => set({ fields })} />
            </div>
            <label className="block">
              <span className="label">Button</span>
              <input value={String(config.submitLabel ?? "")} onChange={(e) => set({ submitLabel: e.target.value })} className="field" maxLength={40} />
            </label>
          </>
        )}
        {kind === "button" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Button text</span>
              <input value={String(config.label ?? "")} onChange={(e) => set({ label: e.target.value })} className="field" maxLength={60} />
            </label>
            <label className="block">
              <span className="label">Opens</span>
              <input value={String(config.url ?? "")} onChange={(e) => set({ url: e.target.value })} className="field" placeholder="https://" />
            </label>
          </div>
        )}
        {kind === "followups" && (
          <label className="block">
            <span className="label">How many questions to offer</span>
            <select value={Number(config.count ?? 3)} onChange={(e) => set({ count: Number(e.target.value) })} className="field w-32">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
        {kind !== "followups" && (
          <label className="flex items-start justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span className="text-sm">
              <span className="block font-medium">Only in procedures</span>
              <span className="text-xs text-muted">The agent uses it only when a procedure step calls @{name}.</span>
            </span>
            <Toggle checked={proceduresOnly} onChange={setProceduresOnly} label="Only in procedures" />
          </label>
        )}
        {error && <Notice>{error}</Notice>}
      </div>
    </Dialog>
  );
}
