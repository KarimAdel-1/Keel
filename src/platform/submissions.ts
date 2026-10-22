// What visitors fill in through the agent's forms: leads (contact details), collected data and custom forms. Each
// submission belongs to the conversation it came from; a lead with an email also becomes (or updates) a contact.

import type { FieldSpec } from "@/core/widgets";
import { db } from "@/lib/db";
import { json, newId, now } from "@/lib/rows";
import { upsertContact } from "./contacts";
import { getAgent } from "./store";
import { dispatchWebhook } from "./webhooks";

export type SubmissionKind = "lead" | "data" | "form";

export interface Submission {
  id: string;
  agentId: string;
  actionId?: string;
  conversationId?: string;
  contactId?: string;
  kind: SubmissionKind;
  data: Record<string, string>;
  createdAt: string;
}

type Row = { id: string; agent_id: string; action_id: string | null; conversation_id: string | null; contact_id: string | null; kind: SubmissionKind; data: string; created_at: string };

const toSubmission = (r: Row): Submission => ({
  id: r.id,
  agentId: r.agent_id,
  ...(r.action_id ? { actionId: r.action_id } : {}),
  ...(r.conversation_id ? { conversationId: r.conversation_id } : {}),
  ...(r.contact_id ? { contactId: r.contact_id } : {}),
  kind: r.kind,
  data: json(r.data, {}),
  createdAt: r.created_at,
});

/** The visitor's answers checked against the form: required fields present, emails and phones plausible. */
export function checkAnswers(fields: FieldSpec[], answers: Record<string, unknown>): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  const data: Record<string, string> = {};
  for (const f of fields) {
    const value = typeof answers[f.key] === "string" ? (answers[f.key] as string).trim().slice(0, 2000) : "";
    if (!value) {
      if (f.required) return { ok: false, error: `Please fill in ${f.label.toLowerCase()}.` };
      continue;
    }
    if (f.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return { ok: false, error: "That email address doesn't look right." };
    if (f.type === "phone" && !/^[+()\d\s.-]{6,20}$/.test(value)) return { ok: false, error: "That phone number doesn't look right." };
    if (f.type === "number" && Number.isNaN(Number(value))) return { ok: false, error: `${f.label} should be a number.` };
    if (f.type === "choice" && f.options?.length && !f.options.includes(value)) return { ok: false, error: `Choose one of the options for ${f.label.toLowerCase()}.` };
    data[f.key] = value;
  }
  return { ok: true, data };
}

export async function addSubmission(input: { agentId: string; actionId?: string; conversationId?: string; kind: SubmissionKind; data: Record<string, string> }): Promise<Submission> {
  const agent = await getAgent(input.agentId);
  const contact = agent && (input.data.email || input.data.phone) ? await upsertContact({ workspaceId: agent.workspaceId, agentId: agent.id, name: input.data.name, email: input.data.email, phone: input.data.phone }) : undefined;
  const id = newId("sub");
  await db()
    .prepare("INSERT INTO submissions (id, agent_id, action_id, conversation_id, contact_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, input.agentId, input.actionId ?? null, input.conversationId ?? null, contact?.id ?? null, input.kind, JSON.stringify(input.data), now());
  if (contact && input.conversationId) await db().prepare("UPDATE conversations SET contact_id = COALESCE(contact_id, ?) WHERE id = ?").run(contact.id, input.conversationId);
  const submission = toSubmission((await db().prepare("SELECT * FROM submissions WHERE id = ?").get<Row>(id))!);
  await dispatchWebhook(input.agentId, input.kind === "lead" ? "lead.collected" : "data.collected", { submission });
  return submission;
}

export async function listSubmissions(agentId: string, kinds: SubmissionKind[], options: { from?: string; to?: string; limit?: number } = {}): Promise<Submission[]> {
  const placeholders = kinds.map(() => "?").join(", ");
  return ((await db()
    .prepare(`SELECT * FROM submissions WHERE agent_id = ? AND kind IN (${placeholders}) AND created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`)
    .all(agentId, ...kinds, options.from ?? "0000", options.to ?? "9999", options.limit ?? 500)) as Row[]).map(toSubmission);
}

