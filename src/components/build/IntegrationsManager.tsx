"use client";

import { Camera, Check, Copy, Hash, LifeBuoy, MessageCircle, MessagesSquare, Send, Ticket, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { INTEGRATION_INFO, INTEGRATION_KINDS, type IntegrationKind } from "@/core/integrations";
import type { IntegrationView } from "@/platform/integrations";
import { Dialog } from "../Dialog";
import { Notice, Pill, Spinner, Toggle, timeAgo } from "../ui";

const ICON: Record<IntegrationKind, LucideIcon> = {
  whatsapp: MessageCircle,
  messenger: MessagesSquare,
  instagram: Camera,
  telegram: Send,
  slack: Hash,
  zendesk: LifeBuoy,
  freshdesk: Ticket,
};
const GROUPS = [...new Set(INTEGRATION_KINDS.map((k) => INTEGRATION_INFO[k].group))];

/**
 * Channels › Apps and tools: the messaging apps the agent answers on, and the support tools the team already uses.
 * Each is connected with the business's own keys, checked with the platform before it's saved.
 */
export function IntegrationsManager({
  agentId,
  initial,
  publicBase,
  reachable,
}: {
  agentId: string;
  initial: IntegrationView[];
  publicBase: string;
  reachable: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "connected" | "error">("all");
  const [category, setCategory] = useState("All categories");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<{ kind: IntegrationKind; existing?: IntegrationView } | null>(null);

  async function toggle(item: IntegrationView, enabled: boolean) {
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, enabled } : i)));
    await fetch(`/api/agents/${agentId}/integrations/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }

  const visible = INTEGRATION_KINDS.filter((k) => {
    const connected = items.find((i) => i.kind === k);
    return (
      (filter === "all" || (filter === "connected" ? connected && connected.status !== "error" : connected?.status === "error")) &&
      (category === "All categories" || INTEGRATION_INFO[k].group === category) &&
      `${INTEGRATION_INFO[k].title} ${INTEGRATION_INFO[k].text}`.toLowerCase().includes(search.toLowerCase())
    );
  });
  return (
    <div className="space-y-6">
      {!reachable && (
        <Notice tone="warn">
          Messaging apps need a public HTTPS address before they can receive messages. Team support tools can still be connected.
          <details className="mt-2">
            <summary>Connection setup</summary>
            <span className="mt-2 block">Current address: {publicBase}. Set KEEL_PUBLIC_URL to your public address; see Go live in the README.</span>
          </details>
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:border-r lg:border-line lg:pr-5">
          <div>
            <h2 className="mb-3 text-xs font-medium text-muted">Overview</h2>
            <nav className="space-y-1" aria-label="Integration filters">
              {(
                [
                  ["all", "All integrations", INTEGRATION_KINDS.length],
                  ["connected", "Connected", items.filter((i) => i.status !== "error").length],
                  ["error", "Needs attention", items.filter((i) => i.status === "error").length],
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${filter === key ? "bg-panel-3 font-medium" : "text-muted hover:bg-panel-2"}`}
                >
                  <span>{label}</span>
                  <span className="text-xs">{count}</span>
                </button>
              ))}
            </nav>
          </div>
          <label className="block text-sm">
            <span className="mb-2 block text-xs font-medium text-muted">Categories</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="field text-xs">
              {["All categories", ...GROUPS].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </aside>
        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Integrations</h1>
            <input
              type="search"
              aria-label="Search integrations"
              placeholder="Find an integration…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field w-full sm:w-56"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {visible.map((k) => {
              const Icon = ICON[k];
              const connected = items.find((i) => i.kind === k);
              return (
                <article key={k} className="card flex flex-col p-5">
                  <div className="flex items-center gap-3">
                    <Icon className="size-6 shrink-0 text-muted" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold">{INTEGRATION_INFO[k].title}</h2>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">{INTEGRATION_INFO[k].text}</p>
                  {connected && (
                    <div className="mt-4 flex items-center justify-between gap-2">
                      <Pill tone={connected.status === "error" ? "warn" : "neutral"}>{connected.status === "error" ? "Needs attention" : "Connected"}</Pill>
                      <Toggle checked={connected.enabled} onChange={(on) => void toggle(connected, on)} label={`Turn ${INTEGRATION_INFO[k].title} on or off`} />
                    </div>
                  )}
                  {connected?.lastAt && <p className="mt-2 text-xs text-muted">Last used {timeAgo(connected.lastAt)}</p>}
                  <button
                    type="button"
                    onClick={() => setOpen({ kind: k, ...(connected ? { existing: connected } : {}) })}
                    className="btn btn-secondary mt-5 self-end text-xs"
                  >
                    {connected ? "View settings" : "View details"}
                  </button>
                </article>
              );
            })}
          </div>
          {!visible.length && (
            <div className="card px-6 py-12 text-center">
              <p className="font-medium">No integrations match</p>
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setCategory("All categories");
                  setSearch("");
                }}
                className="btn btn-secondary mt-4"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>
      </div>

      {open && (
        <ConnectDialog
          agentId={agentId}
          kind={open.kind}
          existing={open.existing}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setItems((all) => (all.some((i) => i.id === saved.id) ? all.map((i) => (i.id === saved.id ? saved : i)) : [...all, saved]));
            setOpen({ kind: saved.kind, existing: saved });
          }}
          onDeleted={(id) => {
            setItems((all) => all.filter((i) => i.id !== id));
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function ConnectDialog({
  agentId,
  kind,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  agentId: string;
  kind: IntegrationKind;
  existing?: IntegrationView;
  onClose: () => void;
  onSaved: (i: IntegrationView) => void;
  onDeleted: (id: string) => void;
}) {
  const info = INTEGRATION_INFO[kind];
  const desk = kind === "zendesk" || kind === "freshdesk";
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(info.fields.filter((f) => f.choices).map((f) => [f.key, f.choices![0].value])),
    ...(existing?.config ?? {}),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(existing ? `/api/agents/${agentId}/integrations/${existing.id}` : `/api/agents/${agentId}/integrations`, {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, config: values }),
    }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { integration?: IntegrationView; error?: string };
    setSaving(false);
    if (!res?.ok || !body.integration) return setError(body.error ?? "It couldn't be connected. Check your connection and try again.");
    setSaved(true);
    onSaved(body.integration);
  }

  async function remove() {
    if (!existing) return;
    setSaving(true);
    await fetch(`/api/agents/${agentId}/integrations/${existing.id}`, { method: "DELETE" }).catch(() => undefined);
    setSaving(false);
    onDeleted(existing.id);
  }

  const shown = info.fields.filter((f) => f.key !== "pageId" || kind !== "instagram" || values.api === "facebook");
  return (
    <Dialog
      title={`${existing ? "" : "Connect "}${info.title}`}
      subtitle={info.text}
      onClose={onClose}
      footer={
        <>
          {existing && (
            <button type="button" onClick={() => void remove()} disabled={saving} className="btn btn-ghost mr-auto text-bad">
              <Trash2 className="size-4" /> Disconnect
            </button>
          )}
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">
            {saving && <Spinner />} {existing ? "Save and check" : "Connect"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          {info.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <div className="space-y-3">
          {shown.map((f) => (
            <label key={f.key} className="block">
              <span className="label">
                {f.label}
                {f.optional && <span className="font-normal text-subtle"> (optional)</span>}
              </span>
              {f.choices ? (
                <select value={values[f.key] ?? f.choices[0].value} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className="field">
                  {f.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.placeholder}
                  className="field font-mono text-[13px]"
                />
              )}
              <span className="mt-1 block text-xs text-subtle">{f.help}</span>
            </label>
          ))}
        </div>
        {error && <Notice>{error}</Notice>}
        {saved && existing && <Notice tone="good">Connected: {existing.detail}.</Notice>}
        {existing?.status === "error" && !saved && <Notice tone="warn">The last message didn&apos;t go through: {existing.detail}</Notice>}
        {existing?.webhookUrl && (
          <div className="rounded-xl border border-line bg-panel-2/50 p-4">
            <p className="text-sm font-medium">
              {kind === "telegram" ? "Connected to Keel" : desk ? `So your ${info.title} replies reach the chat` : "Paste these into your Meta app"}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {kind === "telegram"
                ? "Keel pointed your bot here by itself. Send it a message in Telegram to try it."
                : desk
                  ? `Use these in ${info.title}'s webhook, as the steps above say. Without it, tickets still arrive in ${info.title}; reply from Keel's Helpdesk inbox to answer in the chat.`
                  : "In the app's Webhooks settings: the callback URL and verify token, then subscribe to messages."}
            </p>
            <CopyLine label={desk ? "Webhook address" : "Callback URL"} value={existing.webhookUrl} />
            {existing.verifyToken && <CopyLine label={desk ? "Bearer token" : "Verify token"} value={existing.verifyToken} />}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs">{value}</code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="btn btn-secondary px-2.5 py-1.5 text-xs"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
