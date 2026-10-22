// Telling the team when a customer needs a person, so a handover never waits on someone happening to watch the inbox:
// an email to each member who wants them, a message in the business's Slack, and the ticket created in its own helpdesk
// (Zendesk, Freshdesk). The dashboard also plays a sound and shows a browser notification while it's open
// (src/components/shell/TeamAlerts.tsx, from ticketsForAlerts()). A failure in one never stops the others, or the chat.

import { INTEGRATION_INFO } from "@/core/integrations";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { createFreshdeskTicket, createZendeskTicket, noteOnFreshdesk, noteOnZendesk, sendSlack, type FreshdeskConfig, type ZendeskConfig } from "@/lib/messaging";
import { setting } from "@/lib/settings";
import { json } from "@/lib/rows";
import { membersOf, userSettings } from "./accounts";
import type { Ticket } from "./helpdesk";
import { listIntegrations } from "./integrations";
import { getContact } from "./contacts";
import { conversationMessages, conversationSummary, getAgent } from "./store";

export type AlertEvent = "ticket" | "handover" | "customer_replied";

const HEADLINE: Record<AlertEvent, string> = {
  ticket: "A customer needs your team",
  handover: "A customer is waiting to chat with your team",
  customer_replied: "A customer replied to your team",
};

/** Keel's address for links in alerts: the public one, or the address the request came in on. */
export async function alertBase(): Promise<string> {
  const configured = setting("KEEL_PUBLIC_URL");
  if (configured) return configured;
  try {
    const { publicUrl } = await import("@/lib/public-url");
    return await publicUrl();
  } catch {
    return "http://localhost:3000";
  }
}

/** The conversation as plain text, for a helpdesk ticket or an email: the last messages, newest last. */
async function transcriptOf(conversationId: string | undefined, max = 12): Promise<string> {
  if (!conversationId) return "";
  const messages = (await conversationMessages(conversationId)).filter((m) => m.role !== "system").slice(-max);
  return messages.map((m) => `${m.role === "user" ? "Customer" : m.role === "human" ? "Team" : "Assistant"}: ${m.content.replace(/\s?\[\d{1,2}\]/g, "")}`).join("\n");
}

/** Sends every alert the business has set up for this ticket. */
export async function alertTeam(ticket: Ticket, event: AlertEvent, base: string): Promise<void> {
  const agent = await getAgent(ticket.agentId);
  if (!agent) return;
  const link = `${base.replace(/\/+$/, "")}/app/helpdesk?t=${ticket.id}`;
  const conversation = ticket.conversationId ? await conversationSummary(ticket.conversationId) : undefined;
  const from = conversation ? { playground: "the test chat", widget: "your website", share: "the chat page", api: "your API", test: "a test", whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram", telegram: "Telegram" }[conversation.channel] : undefined;
  const lastWords = ticket.conversationId ? (await conversationMessages(ticket.conversationId)).filter((m) => m.role === "user").at(-1)?.content : undefined;
  const headline = HEADLINE[event];
  const work: Promise<unknown>[] = [];

  // Email: everyone in the workspace who keeps alerts on; a customer's reply goes to whoever has the ticket.
  const members = await membersOf(agent.workspaceId);
  const wanted = [];
  for (const m of members) if ((await userSettings(m.id)).emailAlerts !== false) wanted.push(m);
  const to = event === "customer_replied" && ticket.assigneeId ? wanted.filter((m) => m.id === ticket.assigneeId) : wanted;
  if (to.length) {
    work.push(
      sendMail({
        to: to.map((m) => m.email),
        subject: `${headline}: ${ticket.subject}`.slice(0, 160),
        paragraphs: [
          `${headline}, through ${agent.name}${from ? ` on ${from}` : ""}.`,
          ticket.summary,
          ...(lastWords ? [`Their last message: “${lastWords.slice(0, 500)}”`] : []),
          "Reply from the Helpdesk inbox and your answer appears in their chat.",
        ],
        button: { label: "Open in the Helpdesk", url: link },
      }),
    );
  }

  const tools = (await listIntegrations(agent.id)).filter((i) => i.enabled);
  for (const slack of tools.filter((i) => i.kind === "slack")) {
    work.push(sendSlack(slack.config.webhookUrl, `*${headline}* (${agent.name}${from ? `, ${from}` : ""})\n>${ticket.summary.slice(0, 600).replace(/\n/g, "\n>")}\n<${link}|Open in the Helpdesk>`));
  }

  // The ticket in the business's own helpdesk, once, when it opens.
  if (event !== "customer_replied") {
    const contact = conversation?.contactId ? await getContact(conversation.contactId) : undefined;
    const body = [ticket.summary, "", (await transcriptOf(ticket.conversationId)) || "(no messages)", "", `Open it in Keel: ${link}`].join("\n");
    const requester = contact ? { ...(contact.name ? { name: contact.name } : {}), ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}) } : undefined;
    const external: Record<string, string> = {};
    for (const desk of tools.filter((i) => i.kind === "zendesk" || i.kind === "freshdesk")) {
      const create = desk.kind === "zendesk" ? createZendeskTicket(desk.config as unknown as ZendeskConfig, { subject: ticket.subject, body, priority: ticket.priority, requester }) : createFreshdeskTicket(desk.config as unknown as FreshdeskConfig, { subject: ticket.subject, body, priority: ticket.priority, requester });
      work.push(
        create.then(
          (externalId) => {
            if (externalId) external[desk.kind] = externalId;
          },
          (error: Error) =>
            db()
              .prepare("INSERT INTO ticket_events (ticket_id, kind, body, created_at) VALUES (?, 'note', ?, ?)")
              .run(ticket.id, `Couldn't create it in ${INTEGRATION_INFO[desk.kind].title}: ${error.message}`, new Date().toISOString()),
        ),
      );
    }
    await Promise.allSettled(work);
    if (Object.keys(external).length) {
      const row = await db().prepare("SELECT external FROM tickets WHERE id = ?").get<{ external: string }>(ticket.id);
      await db().prepare("UPDATE tickets SET external = ? WHERE id = ?").run(JSON.stringify({ ...json<Record<string, string>>(row?.external, {}), ...external }), ticket.id);
    }
    return;
  }
  // A customer writing again is noted on the ticket in the business's helpdesk too.
  if (lastWords) work.push(noteOnDesks(ticket, `The customer wrote again in the chat:\n\n${lastWords.slice(0, 2000)}`));
  await Promise.allSettled(work);
}

/**
 * An internal note on the ticket's copies in the business's helpdesks (never seen by the customer), so the team working
 * there sees what happened in the chat. `except` is the helpdesk the news came from. A failure is noted in Keel.
 */
export async function noteOnDesks(ticket: Ticket, text: string, except?: "zendesk" | "freshdesk"): Promise<void> {
  const row = await db().prepare("SELECT external FROM tickets WHERE id = ?").get<{ external: string }>(ticket.id);
  const external = json<Record<string, string>>(row?.external, {});
  const desks = (await listIntegrations(ticket.agentId)).filter((i) => i.enabled && (i.kind === "zendesk" || i.kind === "freshdesk") && i.kind !== except && external[i.kind]);
  await Promise.allSettled(
    desks.map((desk) =>
      (desk.kind === "zendesk" ? noteOnZendesk(desk.config as unknown as ZendeskConfig, external.zendesk, text) : noteOnFreshdesk(desk.config as unknown as FreshdeskConfig, external.freshdesk, text)).catch((error: Error) =>
        db().prepare("INSERT INTO ticket_events (ticket_id, kind, body, created_at) VALUES (?, 'note', ?, ?)").run(ticket.id, `Couldn't add it to ${INTEGRATION_INFO[desk.kind].title}: ${error.message}`, new Date().toISOString()),
      ),
    ),
  );
}

export interface TicketAlert {
  id: string;
  subject: string;
  agentName: string;
  /** "new": a ticket opened; "open": the customer wrote again. */
  status: "new" | "open";
  updatedAt: string;
}

/**
 * What customers did after `since` that needs the team, newest first: a ticket opened, or a customer writing again on
 * one. What the team does itself (assigning, notes, replies) never alerts it.
 */
export async function ticketsForAlerts(workspaceId: string, since: string): Promise<TicketAlert[]> {
  return (
    await db()
      .prepare(
        `SELECT t.id, t.subject, e.kind, e.created_at, a.name AS agent_name FROM ticket_events e
         JOIN tickets t ON t.id = e.ticket_id JOIN agents a ON a.id = t.agent_id
         WHERE a.workspace_id = ? AND e.author_id IS NULL AND (e.kind = 'created' OR (e.kind = 'status' AND e.body = 'open')) AND e.created_at > ?
         ORDER BY e.created_at DESC LIMIT 20`,
      )
      .all<{ id: string; subject: string; kind: string; created_at: string; agent_name: string }>(workspaceId, since)
  ).map((r) => ({ id: r.id, subject: r.subject, agentName: r.agent_name, status: r.kind === "created" ? "new" : "open", updatedAt: r.created_at }));
}
