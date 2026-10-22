// Telling the business's own systems what happened: each webhook gets a POST for the events it chose, signed with
// its secret (HMAC-SHA256 of the body, in X-Keel-Signature) so the receiver can check it came from Keel. Sent in the
// background through the public-address guard; the last result is kept to show in Settings.

import { createHmac, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { keepTenant } from "@/lib/tenant";
import { publicFetch } from "@/lib/net";
import { json, newId, now } from "@/lib/rows";
import { openSecret, sealSecret } from "@/lib/secrets";

export const WEBHOOK_EVENTS = ["lead.collected", "data.collected", "ticket.created", "conversation.handed_over", "test.finished"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_INFO: Record<WebhookEvent, string> = {
  "lead.collected": "A visitor left their contact details",
  "data.collected": "A visitor filled in a form",
  "ticket.created": "The agent opened a ticket for the team",
  "conversation.handed_over": "A visitor asked for a person",
  "test.finished": "A test run finished",
};

export interface Webhook {
  id: string;
  agentId: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus?: string;
  lastAt?: string;
  createdAt: string;
}

type Row = { id: string; agent_id: string; url: string; events: string; secret: string; enabled: number; last_status: string | null; last_at: string | null; created_at: string };

const toWebhook = (r: Row): Webhook => ({
  id: r.id,
  agentId: r.agent_id,
  url: r.url,
  events: json(r.events, []),
  enabled: Boolean(r.enabled),
  ...(r.last_status ? { lastStatus: r.last_status } : {}),
  ...(r.last_at ? { lastAt: r.last_at } : {}),
  createdAt: r.created_at,
});

export async function listWebhooks(agentId: string): Promise<Webhook[]> {
  return (await db().prepare("SELECT * FROM webhooks WHERE agent_id = ? ORDER BY created_at").all<Row>(agentId)).map(toWebhook);
}

/** Adds a webhook. The secret is shown once, now; afterwards only the receiver has it. */
export async function createWebhook(agentId: string, url: string, events: WebhookEvent[]): Promise<{ webhook: Webhook; secret: string }> {
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const id = newId("whk");
  await db().prepare("INSERT INTO webhooks (id, agent_id, url, events, secret, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)").run(id, agentId, url, JSON.stringify(events), sealSecret(secret, `${agentId}/webhook.${id}`), now());
  return { webhook: toWebhook((await db().prepare("SELECT * FROM webhooks WHERE id = ?").get<Row>(id))!), secret };
}

export async function deleteWebhook(agentId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM webhooks WHERE id = ? AND agent_id = ?").run(id, agentId);
}

/** A webhook's signing secret, opened from its sealed form (one saved before sealing passes through). */
function secretOf(hook: Row): string {
  try {
    return openSecret(hook.secret, `${hook.agent_id}/webhook.${hook.id}`);
  } catch {
    return "";
  }
}

export const signature = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const pending = ((globalThis as unknown as { __keelWebhookWork?: Set<Promise<unknown>> }).__keelWebhookWork ??= new Set());

/** Sends an event to every webhook of the agent that wants it, in the background. */
export async function dispatchWebhook(agentId: string, event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const hooks = (await db().prepare("SELECT * FROM webhooks WHERE agent_id = ? AND enabled = 1").all<Row>(agentId)).filter((h) => json<string[]>(h.events, []).includes(event));
  // The result is saved after the request may have ended: for the same business.
  const saveStatus = await keepTenant(async (id: string, status: string) => {
    await db().prepare("UPDATE webhooks SET last_status = ?, last_at = ? WHERE id = ?").run(status, now(), id);
  });
  for (const hook of hooks) {
    const body = JSON.stringify({ event, agentId, at: now(), data: payload });
    const work = publicFetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Keel-Webhooks/1.0", "X-Keel-Event": event, "X-Keel-Signature": signature(secretOf(hook), body) },
      body,
      signal: AbortSignal.timeout(8000),
    })
      .then((res) => `${res.status}`)
      .catch(() => "failed")
      .then((status) => saveStatus(hook.id, status));
    pending.add(work);
    void work.finally(() => pending.delete(work));
  }
}

/** Resolves once every webhook in flight has been sent (for tests). */
export async function webhooksSent(): Promise<void> {
  while (pending.size) await Promise.allSettled([...pending]);
}
