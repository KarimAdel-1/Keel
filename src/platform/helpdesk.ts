// The Helpdesk: where people from the business take over from the agent. A ticket is opened when the agent escalates
// or a visitor asks for a person; the team replies from the inbox (the reply appears in the visitor's chat), adds
// internal notes, assigns and moves the ticket through its statuses. While a person has the conversation, the agent
// stays quiet. The team hears about each one wherever it set up (src/platform/alerts.ts), and a reply to a customer who
// wrote from a messaging app goes back to that app (src/platform/integrations.ts).

import { db } from "@/lib/db";
import { currentTenant, withTenant } from "@/lib/tenant";
import { now, newId } from "@/lib/rows";
import { addMessage } from "./store";
import { dispatchWebhook } from "./webhooks";

export const TICKET_STATUSES = ["new", "open", "waiting", "on_hold", "solved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const STATUS_INFO: Record<TicketStatus, { label: string; text: string }> = {
  new: { label: "New", text: "No one has looked at it yet" },
  open: { label: "On you", text: "The team needs to act" },
  waiting: { label: "On customer", text: "Waiting for the customer's reply" },
  on_hold: { label: "On hold", text: "Paused, waiting on something else" },
  solved: { label: "Solved", text: "Done; reopens if the customer writes again" },
  closed: { label: "Closed", text: "Finished for good" },
};

export type TicketPriority = "low" | "normal" | "high";

export interface Ticket {
  id: string;
  agentId: string;
  conversationId?: string;
  contactId?: string;
  subject: string;
  summary: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: number;
  kind: "created" | "note" | "reply" | "status" | "assign";
  authorId?: string;
  body: string;
  createdAt: string;
}

type Row = { id: string; agent_id: string; conversation_id: string | null; contact_id: string | null; subject: string; summary: string; status: TicketStatus; priority: TicketPriority; assignee_id: string | null; created_at: string; updated_at: string };

const toTicket = (r: Row): Ticket => ({
  id: r.id,
  agentId: r.agent_id,
  ...(r.conversation_id ? { conversationId: r.conversation_id } : {}),
  ...(r.contact_id ? { contactId: r.contact_id } : {}),
  subject: r.subject,
  summary: r.summary,
  status: r.status,
  priority: r.priority,
  ...(r.assignee_id ? { assigneeId: r.assignee_id } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function event(ticketId: string, kind: TicketEvent["kind"], body: string, authorId?: string): Promise<void> {
  await db().prepare("INSERT INTO ticket_events (ticket_id, kind, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)").run(ticketId, kind, authorId ?? null, body, now());
}

/** Opens a ticket for a conversation (or returns the open one it already has). */
export async function openTicket(input: { agentId: string; conversationId?: string; subject: string; summary: string; priority?: TicketPriority; handover?: boolean }): Promise<Ticket> {
  if (input.conversationId) {
    const existing = await db().prepare("SELECT * FROM tickets WHERE conversation_id = ? AND status NOT IN ('solved', 'closed')").get<Row>(input.conversationId);
    if (existing) return toTicket(existing);
  }
  const contactId = input.conversationId ? ((await db().prepare("SELECT contact_id FROM conversations WHERE id = ?").get<{ contact_id?: string }>(input.conversationId))?.contact_id ?? null) : null;
  const id = newId("tkt");
  const at = now();
  await db()
    .prepare("INSERT INTO tickets (id, agent_id, conversation_id, contact_id, subject, summary, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)")
    .run(id, input.agentId, input.conversationId ?? null, contactId, input.subject.slice(0, 200), input.summary.slice(0, 4000), input.priority ?? "normal", at, at);
  await event(id, "created", input.summary.slice(0, 4000));
  if (input.handover && input.conversationId) await db().prepare("UPDATE conversations SET status = 'handed_off' WHERE id = ?").run(input.conversationId);
  const ticket = (await getTicket(id))!;
  await dispatchWebhook(input.agentId, input.handover ? "conversation.handed_over" : "ticket.created", { ticket });
  await alertLater(ticket, input.handover ? "handover" : "ticket");
  return ticket;
}

/** Tells the team, in the background: email, Slack and its own helpdesk take a moment, and the chat goes on meanwhile. */
async function alertLater(ticket: Ticket, event: "ticket" | "handover" | "customer_replied"): Promise<void> {
  const [{ alertTeam, alertBase }, { inBackground }] = await Promise.all([import("./alerts"), import("./knowledge/jobs")]);
  const base = await alertBase();
  const workspaceId = await currentTenant();
  void inBackground(withTenant(workspaceId, () => alertTeam(ticket, event, base)).catch((error) => console.error(`Keel couldn't alert the team about ${ticket.id}: ${(error as Error).message}`)));
}

export async function getTicket(id: string): Promise<Ticket | undefined> {
  const row = await db().prepare("SELECT * FROM tickets WHERE id = ?").get<Row>(id);
  return row ? toTicket(row) : undefined;
}

export async function ticketEvents(ticketId: string): Promise<TicketEvent[]> {
  return (await db().prepare("SELECT id, kind, author_id, body, created_at FROM ticket_events WHERE ticket_id = ? ORDER BY id").all<{ id: number; kind: TicketEvent["kind"]; author_id: string | null; body: string; created_at: string }>(ticketId)).map((e) => ({
    id: e.id,
    kind: e.kind,
    ...(e.author_id ? { authorId: e.author_id } : {}),
    body: e.body,
    createdAt: e.created_at,
  }));
}

export async function conversationTickets(conversationId: string): Promise<Ticket[]> {
  return (await db().prepare("SELECT * FROM tickets WHERE conversation_id = ? ORDER BY created_at").all<Row>(conversationId)).map(toTicket);
}

/** Whether the conversation has a ticket the team hasn't solved yet, so a reply from them may still come. */
export async function hasOpenTicket(conversationId: string): Promise<boolean> {
  return Boolean(await db().prepare("SELECT 1 FROM tickets WHERE conversation_id = ? AND status NOT IN ('solved', 'closed') LIMIT 1").get(conversationId));
}

export type InboxView = "mine" | "unassigned" | "all" | "solved";

/** The tickets of a workspace's agents in one of the inbox's views, newest activity first. */
export async function listTickets(workspaceId: string, view: InboxView, userId: string, agentId?: string): Promise<(Ticket & { agentName: string })[]> {
  const filter = {
    mine: "AND t.assignee_id = ? AND t.status NOT IN ('solved', 'closed')",
    unassigned: "AND t.assignee_id IS NULL AND t.status NOT IN ('solved', 'closed')",
    all: "AND t.status NOT IN ('solved', 'closed')",
    solved: "AND t.status IN ('solved', 'closed')",
  }[view];
  const args: unknown[] = [workspaceId, ...(view === "mine" ? [userId] : []), ...(agentId ? [agentId] : [])];
  return (await db()
    .prepare(`SELECT t.*, a.name AS agent_name FROM tickets t JOIN agents a ON a.id = t.agent_id WHERE a.workspace_id = ? ${filter} ${agentId ? "AND t.agent_id = ?" : ""} ORDER BY t.updated_at DESC LIMIT 300`)
    .all<Row & { agent_name: string }>(...args)).map((r) => ({ ...toTicket(r), agentName: r.agent_name }));
}

export async function ticketCounts(workspaceId: string, userId: string): Promise<Record<InboxView, number>> {
  const count = async (view: InboxView) => (await listTickets(workspaceId, view, userId)).length;
  return { mine: await count("mine"), unassigned: await count("unassigned"), all: await count("all"), solved: await count("solved") };
}

async function touch(id: string, change: Partial<Record<"status" | "assignee_id" | "priority", string | null>>): Promise<void> {
  const sets = Object.keys(change).map((k) => `${k} = ?`);
  await db().prepare(`UPDATE tickets SET ${[...sets, "updated_at = ?"].join(", ")} WHERE id = ?`).run(...Object.values(change), now(), id);
}

export async function setStatus(id: string, status: TicketStatus, authorId?: string): Promise<void> {
  const ticket = await getTicket(id);
  if (!ticket || ticket.status === status) return;
  await touch(id, { status });
  await event(id, "status", status, authorId);
  // A solved or closed ticket gives the conversation back to the agent.
  if (ticket.conversationId && (status === "solved" || status === "closed")) await db().prepare("UPDATE conversations SET status = 'open' WHERE id = ? AND status = 'handed_off'").run(ticket.conversationId);
}

export async function assign(id: string, userId: string | null, authorId?: string): Promise<void> {
  await touch(id, { assignee_id: userId });
  await event(id, "assign", userId ?? "", authorId);
}

export async function addNote(id: string, body: string, authorId: string): Promise<void> {
  await touch(id, {});
  await event(id, "note", body.slice(0, 8000), authorId);
}

/** A reply from the team: it appears in the visitor's chat, and the conversation stays with the team. */
/**
 * A reply from the team, in the customer's chat (and their messaging app). `author.id` is the Keel user who wrote it;
 * `from` is the business's helpdesk when it was written there, so it isn't copied back to it.
 */
export async function replyAsTeam(id: string, body: string, author: { id?: string; name: string }, options: { from?: "zendesk" | "freshdesk" } = {}): Promise<void> {
  const ticket = await getTicket(id);
  if (!ticket) return;
  let undelivered: string | undefined;
  if (ticket.conversationId) {
    await addMessage(ticket.conversationId, { role: "human", content: body.slice(0, 8000), meta: { author: author.name } });
    await db().prepare("UPDATE conversations SET status = 'handed_off' WHERE id = ?").run(ticket.conversationId);
    // A customer who wrote from a messaging app gets the reply there.
    const { deliverTeamReply } = await import("./integrations");
    const delivery = await deliverTeamReply(ticket.conversationId, body);
    if (delivery && !delivery.ok) undelivered = delivery.error;
  }
  await touch(id, { status: ticket.status === "new" || ticket.status === "open" ? "waiting" : ticket.status, ...(ticket.assigneeId || !author.id ? {} : { assignee_id: author.id }) });
  // Someone who isn't a Keel user (a reply written in the business's helpdesk) is kept by name.
  await event(id, "reply", body.slice(0, 8000), author.id ?? `ext:${author.name.slice(0, 80)}`);
  const where = options.from === "zendesk" ? "Zendesk" : options.from === "freshdesk" ? "Freshdesk" : "Keel";
  if (options.from) await event(id, "note", `${author.name} replied in ${where}; the reply was sent to the customer's chat.`);
  if (undelivered) await event(id, "note", undelivered);
  // The ticket in the business's own helpdesk keeps the whole story.
  const { noteOnDesks } = await import("./alerts");
  await noteOnDesks(ticket, `${author.name} replied in ${where}:\n\n${body}`, options.from);
}

/** When the visitor writes again on a ticket waiting for them, it's back on the team. */
export async function customerReplied(conversationId: string): Promise<void> {
  const row = await db().prepare("SELECT id, status FROM tickets WHERE conversation_id = ? AND status IN ('waiting', 'solved') ORDER BY updated_at DESC LIMIT 1").get<{ id: string; status: TicketStatus }>(conversationId);
  if (row) {
    await touch(row.id, { status: "open" });
    await event(row.id, "status", "open");
    const ticket = await getTicket(row.id);
    if (ticket) await alertLater(ticket, "customer_replied");
  }
}
