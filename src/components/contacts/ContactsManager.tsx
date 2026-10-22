"use client";

import { ContactRound, Plus, Search, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Contact } from "@/platform/contacts";
import { Dialog } from "../Dialog";
import { EmptyState, Notice, Spinner, timeAgo } from "../ui";

const PAGE = 50;

/**
 * Contacts: the people your agents have met or you've added, shared by every agent in the workspace. Leads with an
 * email become contacts on their own; you can add people, or import a CSV.
 */
export function ContactsManager({ agentId, initial, total: initialTotal, fields, q: initialQ }: { agentId: string; initial: Contact[]; total: number; fields: { key: string; label: string }[]; q: string }) {
  const [contacts, setContacts] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [q, setQ] = useState(initialQ);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Contact | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function load(search: string, from: number) {
    setLoading(true);
    const res = await fetch(`/api/workspace/contacts?q=${encodeURIComponent(search)}&offset=${from}`);
    const body = (await res.json().catch(() => ({}))) as { contacts?: Contact[]; total?: number };
    setLoading(false);
    setContacts(body.contacts ?? []);
    setTotal(body.total ?? 0);
    setOffset(from);
  }

  async function importCsv(f: File) {
    setNotice(null);
    const form = new FormData();
    form.set("file", f);
    const res = await fetch("/api/workspace/contacts/import", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { added?: number; skipped?: number; error?: string };
    if (!res.ok) return setNotice({ tone: "bad", text: body.error ?? "The file couldn't be imported." });
    setNotice({ tone: "good", text: `Imported ${body.added ?? 0} contact${body.added === 1 ? "" : "s"}${body.skipped ? `; skipped ${body.skipped} rows without a name, email or phone` : ""}.` });
    await load(q, 0);
  }

  async function remove(c: Contact) {
    setContacts((all) => all.filter((x) => x.id !== c.id));
    setTotal((t) => t - 1);
    setViewing(null);
    await fetch(`/api/workspace/contacts/${c.id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(q, 0);
          }}
          className="relative min-w-[240px] flex-1"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, phone or id" className="field pl-9" />
        </form>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])} />
        <button type="button" onClick={() => file.current?.click()} className="btn btn-secondary">
          <Upload className="size-4" /> Import CSV
        </button>
        <button type="button" onClick={() => setAdding(true)} className="btn btn-primary">
          <Plus className="size-4" /> Add contact
        </button>
      </div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {contacts.length === 0 && !loading ? (
        <EmptyState
          icon={<ContactRound className="size-5" />}
          title={q ? "No one matches" : "No contacts yet"}
          text={
            q ? (
              "Try another name or email."
            ) : (
              <>
                People who leave their email through the <Link href={`/app/agents/${agentId}/actions`} className="font-medium underline underline-offset-2">Collect leads</Link> action appear here. You can also add them yourself or import a CSV with a header row (name, email, phone, and any of your fields).
              </>
            )
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-panel-2/60 text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                {fields.slice(0, 3).map((f) => (
                  <th key={f.key} className="px-4 py-2.5 font-medium">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {contacts.map((c) => (
                <tr key={c.id} onClick={() => setViewing(c)} className="cursor-pointer hover:bg-panel-2/60">
                  <td className="px-4 py-3 font-medium">{c.name || <span className="text-subtle">No name</span>}</td>
                  <td className="px-4 py-3">{c.email ?? ""}</td>
                  <td className="px-4 py-3">{c.phone ?? ""}</td>
                  {fields.slice(0, 3).map((f) => (
                    <td key={f.key} className="max-w-[200px] truncate px-4 py-3">
                      {c.attributes[f.key] ?? ""}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>
              {loading ? <Spinner className="size-3.5" /> : `${total ? offset + 1 : 0}–${Math.min(offset + PAGE, total)} of ${total}`}
            </span>
            <span className="flex gap-2">
              <button type="button" disabled={offset === 0 || loading} onClick={() => void load(q, Math.max(0, offset - PAGE))} className="btn btn-secondary px-2.5 py-1 text-xs">
                Previous
              </button>
              <button type="button" disabled={offset + PAGE >= total || loading} onClick={() => void load(q, offset + PAGE)} className="btn btn-secondary px-2.5 py-1 text-xs">
                Next
              </button>
            </span>
          </div>
        </div>
      )}

      {adding && (
        <AddContact
          fields={fields}
          onClose={() => setAdding(false)}
          onAdded={(c) => {
            setContacts((all) => [c, ...all.filter((x) => x.id !== c.id)]);
            setTotal((t) => t + 1);
            setAdding(false);
          }}
        />
      )}
      {viewing && (
        <Dialog
          title={viewing.name || viewing.email || "Contact"}
          onClose={() => setViewing(null)}
          footer={
            <button type="button" onClick={() => void remove(viewing)} className="btn btn-ghost mr-auto text-bad">
              <Trash2 className="size-4" /> Delete contact
            </button>
          }
        >
          <dl className="divide-y divide-line text-sm">
            {[
              ["Email", viewing.email],
              ["Phone", viewing.phone],
              ["Your id", viewing.externalId],
              ...fields.map((f) => [f.label, viewing.attributes[f.key]]),
              ...Object.entries(viewing.attributes)
                .filter(([k]) => !fields.some((f) => f.key === k))
                .map(([k, v]) => [k.replace(/_/g, " "), v]),
              ["Added", new Date(viewing.createdAt).toLocaleString("en-GB")],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="grid grid-cols-[130px_1fr] gap-3 py-2.5">
                  <dt className="capitalize text-muted">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
          </dl>
        </Dialog>
      )}
    </div>
  );
}

function AddContact({ fields, onClose, onAdded }: { fields: { key: string; label: string }[]; onClose: () => void; onAdded: (c: Contact) => void }) {
  const [d, setD] = useState({ name: "", email: "", phone: "", externalId: "" });
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/workspace/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...d, attributes: Object.fromEntries(Object.entries(attributes).filter(([, v]) => v.trim())) }),
    });
    const body = (await res.json().catch(() => ({}))) as { contact?: Contact; error?: string };
    setSaving(false);
    if (!res.ok || !body.contact) return setError(body.error ?? "The contact couldn't be added.");
    onAdded(body.contact);
  }

  return (
    <Dialog
      title="Add contact"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary">{saving ? "Adding…" : "Add contact"}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["name", "Name"],
            ["email", "Email"],
            ["phone", "Phone"],
            ["externalId", "Your id for them"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block">
            <span className="label">{label}</span>
            <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className="field" type={k === "email" ? "email" : "text"} />
          </label>
        ))}
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="label">{f.label}</span>
            <input value={attributes[f.key] ?? ""} onChange={(e) => setAttributes({ ...attributes, [f.key]: e.target.value })} className="field" />
          </label>
        ))}
        {error && (
          <div className="sm:col-span-2">
            <Notice>{error}</Notice>
          </div>
        )}
      </div>
    </Dialog>
  );
}
