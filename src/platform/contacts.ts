// The people a workspace's agents talk to. A contact is made when a visitor leaves their details (a lead or a form),
// is added by hand or imported, and is found again by email. Custom fields are the workspace's own attributes.

import { db } from "@/lib/db";
import { json, newId, now } from "@/lib/rows";

export interface Contact {
  id: string;
  workspaceId: string;
  agentId?: string;
  externalId?: string;
  name?: string;
  email?: string;
  phone?: string;
  attributes: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

type Row = { id: string; workspace_id: string; agent_id: string | null; external_id: string | null; name: string | null; email: string | null; phone: string | null; attributes: string; created_at: string; updated_at: string };

const toContact = (r: Row): Contact => ({
  id: r.id,
  workspaceId: r.workspace_id,
  ...(r.agent_id ? { agentId: r.agent_id } : {}),
  ...(r.external_id ? { externalId: r.external_id } : {}),
  ...(r.name ? { name: r.name } : {}),
  ...(r.email ? { email: r.email } : {}),
  ...(r.phone ? { phone: r.phone } : {}),
  attributes: json(r.attributes, {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : undefined);

/** Adds a contact, or updates the one with the same email: new details fill in, nothing known is erased. */
export async function upsertContact(input: { workspaceId: string; agentId?: string; name?: string; email?: string; phone?: string; externalId?: string; attributes?: Record<string, string> }): Promise<Contact> {
  const email = clean(input.email)?.toLowerCase();
  const existing = email ? ((await db().prepare("SELECT * FROM contacts WHERE workspace_id = ? AND email = ?").get(input.workspaceId, email)) as Row | undefined) : undefined;
  const at = now();
  if (existing) {
    const attrs = { ...json<Record<string, string>>(existing.attributes, {}), ...(input.attributes ?? {}) };
    await db()
      .prepare("UPDATE contacts SET name = COALESCE(?, name), phone = COALESCE(?, phone), external_id = COALESCE(?, external_id), attributes = ?, updated_at = ? WHERE id = ?")
      .run(clean(input.name) ?? null, clean(input.phone) ?? null, clean(input.externalId) ?? null, JSON.stringify(attrs), at, existing.id);
    return (await getContact(existing.id))!;
  }
  const id = newId("ctc");
  await db()
    .prepare("INSERT INTO contacts (id, workspace_id, agent_id, external_id, name, email, phone, attributes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.workspaceId, input.agentId ?? null, clean(input.externalId) ?? null, clean(input.name) ?? null, email ?? null, clean(input.phone) ?? null, JSON.stringify(input.attributes ?? {}), at, at);
  return (await getContact(id))!;
}

export async function getContact(id: string): Promise<Contact | undefined> {
  const row = (await db().prepare("SELECT * FROM contacts WHERE id = ?").get(id)) as Row | undefined;
  return row ? toContact(row) : undefined;
}

export async function listContacts(workspaceId: string, options: { search?: string; limit?: number; offset?: number } = {}): Promise<{ contacts: Contact[]; total: number }> {
  const search = options.search?.trim().toLowerCase();
  const where = search ? "AND (lower(coalesce(name,'')) LIKE ? OR lower(coalesce(email,'')) LIKE ? OR lower(coalesce(phone,'')) LIKE ? OR lower(coalesce(external_id,'')) LIKE ?)" : "";
  const args = search ? Array(4).fill(`%${search}%`) : [];
  const total = Number(((await db().prepare(`SELECT COUNT(*) AS n FROM contacts WHERE workspace_id = ? ${where}`).get(workspaceId, ...args)) as { n: number }).n);
  const rows = (await db()
    .prepare(`SELECT * FROM contacts WHERE workspace_id = ? ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(workspaceId, ...args, options.limit ?? 50, options.offset ?? 0)) as Row[];
  return { contacts: rows.map(toContact), total };
}

export async function deleteContact(id: string): Promise<void> {
  await db().prepare("DELETE FROM contacts WHERE id = ?").run(id);
}

/** Contacts from a CSV with a header row (name, email, phone, external id, then any custom fields). */
export async function importContacts(workspaceId: string, csv: string): Promise<{ added: number; skipped: number }> {
  const rows = parseCsv(csv);
  const [header, ...body] = rows;
  if (!header) return { added: 0, skipped: 0 };
  const keys = header.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  let added = 0;
  let skipped = 0;
  for (const cells of body.slice(0, 10_000)) {
    const record = Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? "").trim()]));
    const { name, email, phone, external_id: externalId, ...rest } = record;
    if (!email && !phone && !name) {
      skipped++;
      continue;
    }
    await upsertContact({ workspaceId, name, email, phone, externalId, attributes: Object.fromEntries(Object.entries(rest).filter(([, v]) => v)) });
    added++;
  }
  return { added, skipped };
}

/** A CSV's rows and cells: quoted cells, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** A value made safe for a CSV cell. */
export const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  // A leading = + - @ would be read as a formula by a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The workspace's custom contact fields. */
export async function contactFields(workspaceId: string): Promise<{ key: string; label: string }[]> {
  const row = (await db().prepare("SELECT settings FROM workspaces WHERE id = ?").get(workspaceId)) as { settings?: string } | undefined;
  return json<{ contactFields?: { key: string; label: string }[] }>(row?.settings, {}).contactFields ?? [];
}

export async function setContactFields(workspaceId: string, fields: { key: string; label: string }[]): Promise<void> {
  const row = (await db().prepare("SELECT settings FROM workspaces WHERE id = ?").get(workspaceId)) as { settings?: string } | undefined;
  const settings = { ...json<Record<string, unknown>>(row?.settings, {}), contactFields: fields };
  await db().prepare("UPDATE workspaces SET settings = ? WHERE id = ?").run(JSON.stringify(settings), workspaceId);
}
