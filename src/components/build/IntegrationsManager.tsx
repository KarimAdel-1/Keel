"use client";

import { Camera, Check, Copy, Hash, LifeBuoy, MessageCircle, MessagesSquare, Plug, Send, Ticket, Trash2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { INTEGRATION_INFO, INTEGRATION_KINDS, type IntegrationKind } from "@/core/integrations";
import type { IntegrationView } from "@/platform/integrations";
import { Dialog } from "../Dialog";
import { Notice, Pill, Spinner, Toggle, timeAgo } from "../ui";

const ICON: Record<IntegrationKind, LucideIcon> = { whatsapp: MessageCircle, messenger: MessagesSquare, instagram: Camera, telegram: Send, slack: Hash, zendesk: LifeBuoy, freshdesk: Ticket };
const GROUPS = [...new Set(INTEGRATION_KINDS.map((k) => INTEGRATION_INFO[k].group))];

/**
 * Channels › Apps and tools: the messaging apps the agent answers on, and the support tools the team already uses.
 * Each is connected with the business's own keys, checked with the platform before it's saved.
 */
export function IntegrationsManager({ agentId, initial, publicBase, reachable }: { agentId: string; initial: IntegrationView[]; publicBase: string; reachable: boolean }) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<{ kind: IntegrationKind; existing?: IntegrationView } | null>(null);

  async function toggle(item: IntegrationView, enabled: boolean) {
    setItems((all) => all.map((i) => (i.id === item.id ? { ...i, enabled } : i)));
    await fetch(`/api/agents/${agentId}/integrations/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
  }

  return (
    <div className="space-y-8">
      {!reachable && (
        <Notice tone="warn">
          Messaging apps reach Keel on a public https:// address, and this server is at {publicBase}. Put Keel on your public address and set KEEL_PUBLIC_URL first (see Go live in the README). Slack, Zendesk and Freshdesk work from anywhere.
        </Notice>
      )}
      {items.length > 0 && (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold">Connected</h2>
          <ul className="card divide-y divide-line overflow-hidden">
            {items.map((i) => {
              const Icon = ICON[i.kind];
              return (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-panel-2">
                    <Icon className="size-4" />
                  </span>
                  <button type="button" onClick={() => setOpen({ kind: i.kind, existing: i })} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {INTEGRATION_INFO[i.kind].title} {i.status === "error" ? <Pill tone="bad">Needs attention</Pill> : <Pill tone="good">Connected</Pill>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {i.detail}
                      {i.lastAt ? ` · last used ${timeAgo(i.lastAt)}` : ""}
                    </span>
                  </button>
                  <Toggle checked={i.enabled} onChange={(on) => void toggle(i, on)} label={`Turn ${INTEGRATION_INFO[i.kind].title} on or off`} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {GROUPS.map((group) => (
        <section key={group}>
          <h2 className="mb-1 text-[15px] font-semibold">{group}</h2>
          <p className="mb-4 text-sm text-muted">
            {group === "Messaging apps" ? "Customers write to you where they already are; the agent answers, and your team takes over from the Helpdesk." : "When a customer needs a person, your team hears about it where it already works."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {INTEGRATION_KINDS.filter((k) => INTEGRATION_INFO[k].group === group).map((k) => {
              const Icon = ICON[k];
              const connected = items.find((i) => i.kind === k);
              return (
                <div key={k} className="card flex flex-col p-5">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl border border-line bg-panel-2">
                    <Icon className="size-[18px]" />
                  </span>
                  <p className="mt-4 text-[15px] font-semibold">{INTEGRATION_INFO[k].title}</p>
                  <p className="mt-1 flex-1 text-sm text-muted">{INTEGRATION_INFO[k].text}</p>
                  <button type="button" onClick={() => setOpen({ kind: k, ...(connected ? { existing: connected } : {}) })} className="btn btn-secondary mt-4 self-start px-3 py-1.5 text-xs">
                    <Plug className="size-3.5" /> {connected ? "Settings" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}

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

function ConnectDialog({ agentId, kind, existing, onClose, onSaved, onDeleted }: { agentId: string; kind: IntegrationKind; existing?: IntegrationView; onClose: () => void; onSaved: (i: IntegrationView) => void; onDeleted: (id: string) => void }) {
  const info = INTEGRATION_INFO[kind];
  const desk = kind === "zendesk" || kind === "freshdesk";
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...Object.fromEntries(info.fields.filter((f) => f.choices).map((f) => [f.key, f.choices![0].value])), ...(existing?.config ?? {}) }));
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
            <p className="text-sm font-medium">{kind === "telegram" ? "Connected to Keel" : desk ? `So your ${info.title} replies reach the chat` : "Paste these into your Meta app"}</p>
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
