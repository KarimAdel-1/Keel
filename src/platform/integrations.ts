// The messaging apps and support tools a business connects to an agent (src/core/integrations.ts): keeping their keys
// sealed, checking they work, receiving customers' messages from the apps and answering them through the agent's
// customer turn, and sending the team's Helpdesk replies back to the app the customer wrote from.
//
// Each connection has its own webhook address (/api/integrations/<id>/webhook) and secret: the platform calls it, and
// the connection says which business it belongs to, so each message is handled for that business alone.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { INTEGRATION_INFO, SECRET_MASK, forMessaging, isMessaging, type IntegrationKind, type MessagingKind } from "@/core/integrations";
import type { ChatWidget } from "@/core/widgets";
import { db, system } from "@/lib/db";
import type { Picture } from "@/lib/llm";
import {
  IntegrationError,
  checkFreshdesk,
  checkInstagram,
  checkMessenger,
  checkTelegram,
  checkWhatsApp,
  checkZendesk,
  freshdeskReplies,
  photoFrom,
  connectTelegram,
  disconnectTelegram,
  metaSignatureValid,
  parseMeta,
  parseTelegram,
  sendInstagram,
  sendMessenger,
  sendSlack,
  sendTelegram,
  sendWhatsApp,
  zendeskReplies,
  type FreshdeskConfig,
  type HelpdeskReply,
  type Inbound,
  type InstagramConfig,
  type ZendeskConfig,
} from "@/lib/messaging";
import { json, newId, now } from "@/lib/rows";
import { openSecret, sealSecret } from "@/lib/secrets";
import { withTenant } from "@/lib/tenant";
import { converse } from "./chat/converse";
import { upsertContact } from "./contacts";
import { inBackground } from "./knowledge/jobs";
import { asPicture } from "./pictures";
import { getAgent, startConversation } from "./store";

export interface Integration {
  id: string;
  agentId: string;
  kind: IntegrationKind;
  /** Its settings, secrets opened (server side only). */
  config: Record<string, string>;
  enabled: boolean;
  status: "connected" | "error";
  /** What the platform said: the connected account's name, or what went wrong. */
  detail: string;
  /** For the platform's webhook: Meta's verify token, Telegram's secret header. */
  secret: string;
  lastAt?: string;
  createdAt: string;
}

/** What the builder sees: secrets masked, and the webhook address and token to paste into the platform. */
export interface IntegrationView extends Omit<Integration, "config" | "secret"> {
  config: Record<string, string>;
  webhookUrl?: string;
  verifyToken?: string;
}

type Row = { id: string; agent_id: string; kind: IntegrationKind; config: string; enabled: number; status: Integration["status"]; detail: string; secret: string; last_at: string | null; created_at: string };

const place = (agentId: string, id: string, key: string) => `${agentId}/integration.${id}.${key}`;

function toIntegration(r: Row): Integration {
  const stored = json<Record<string, string>>(r.config, {});
  const secretKeys = new Set(INTEGRATION_INFO[r.kind].fields.filter((f) => f.secret).map((f) => f.key));
  const config = Object.fromEntries(
    Object.entries(stored).map(([k, v]) => {
      if (!secretKeys.has(k)) return [k, v];
      try {
        return [k, openSecret(v, place(r.agent_id, r.id, k))];
      } catch {
        return [k, ""];
      }
    }),
  );
  let secret = "";
  try {
    secret = openSecret(r.secret, place(r.agent_id, r.id, "webhook"));
  } catch {}
  return { id: r.id, agentId: r.agent_id, kind: r.kind, config, enabled: Boolean(r.enabled), status: r.status, detail: r.detail, secret, ...(r.last_at ? { lastAt: r.last_at } : {}), createdAt: r.created_at };
}

export async function listIntegrations(agentId: string): Promise<Integration[]> {
  return (await db().prepare("SELECT * FROM integrations WHERE agent_id = ? ORDER BY created_at").all<Row>(agentId)).map(toIntegration);
}

export async function getIntegration(id: string): Promise<Integration | undefined> {
  const row = await db().prepare("SELECT * FROM integrations WHERE id = ?").get<Row>(id);
  return row ? toIntegration(row) : undefined;
}

/** The webhook address for a connection, on Keel's public address. */
export const webhookUrl = (base: string, id: string) => `${base.replace(/\/+$/, "")}/api/integrations/${id}/webhook`;

export function viewOf(i: Integration, base: string): IntegrationView {
  const info = INTEGRATION_INFO[i.kind];
  const secretKeys = new Set(info.fields.filter((f) => f.secret).map((f) => f.key));
  const { secret, ...rest } = i;
  return {
    ...rest,
    config: Object.fromEntries(Object.entries(i.config).map(([k, v]) => [k, secretKeys.has(k) && v ? SECRET_MASK : v])),
    ...(info.webhook ? { webhookUrl: webhookUrl(base, i.id) } : {}),
    ...(info.webhook && i.kind !== "telegram" ? { verifyToken: secret } : {}),
  };
}

/** Whether the platform can reach Keel at this address: Meta and Telegram call only public HTTPS addresses. */
export const reachable = (base: string) => /^https:\/\//.test(base) && !/^https:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(base);

/** Checks the keys work with the platform and returns what it says about the account. */
async function check(kind: IntegrationKind, c: Record<string, string>): Promise<string> {
  switch (kind) {
    case "whatsapp":
      return checkWhatsApp({ phoneNumberId: c.phoneNumberId, accessToken: c.accessToken });
    case "messenger":
      return checkMessenger({ pageId: c.pageId, pageAccessToken: c.pageAccessToken });
    case "instagram":
      return checkInstagram(instagramConfig(c));
    case "telegram":
      return checkTelegram(c.botToken);
    case "slack":
      await sendSlack(c.webhookUrl, "Keel is connected: your team will hear here when a customer needs a person.");
      return "Test message sent";
    case "zendesk":
      return checkZendesk(c as unknown as ZendeskConfig);
    case "freshdesk":
      return checkFreshdesk(c as unknown as FreshdeskConfig);
  }
}

const instagramConfig = (c: Record<string, string>): InstagramConfig => ({ accountId: c.accountId, accessToken: c.accessToken, api: c.api === "facebook" ? "facebook" : "instagram", ...(c.pageId ? { pageId: c.pageId } : {}) });

/**
 * Connects an app or a tool, or changes its settings: the keys are checked with the platform before anything is
 * saved (a masked secret means "keep the saved one"), and a Telegram bot is pointed at Keel. Returns the error to show
 * when the platform turns them down.
 */
export async function saveIntegration(agentId: string, input: { id?: string; kind: IntegrationKind; config: Record<string, string>; enabled?: boolean }, base: string): Promise<{ integration: Integration } | { error: string }> {
  const info = INTEGRATION_INFO[input.kind];
  const before = input.id ? await getIntegration(input.id) : undefined;
  if (input.id && (!before || before.agentId !== agentId || before.kind !== input.kind)) return { error: "That connection doesn't exist." };
  const config: Record<string, string> = {};
  for (const f of info.fields) {
    const given = (input.config[f.key] ?? "").trim();
    const value = given === SECRET_MASK ? (before?.config[f.key] ?? "") : given;
    if (!value && !f.optional && !(f.key === "pageId" && config.api !== "facebook")) return { error: `Fill in ${f.label.toLowerCase()}.` };
    if (value) config[f.key] = value;
  }
  // A messaging app can't work without reaching Keel; a helpdesk still gets its tickets, and its replies wait for the address.
  if (info.webhook && isMessaging(input.kind) && !reachable(base)) {
    return { error: `${info.title} can only reach Keel on a public https:// address, and this server is at ${base}. Set KEEL_PUBLIC_URL to your public address (see Go live in the README), then connect again.` };
  }
  let detail: string;
  try {
    detail = await check(input.kind, config);
  } catch (error) {
    return { error: error instanceof IntegrationError ? error.message : `${info.title} couldn't be checked: ${(error as Error).message}` };
  }
  const id = before?.id ?? newId("int");
  const secret = before?.secret || randomBytes(24).toString("base64url");
  if (input.kind === "telegram") {
    try {
      await connectTelegram(config.botToken, webhookUrl(base, id), secret);
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
  const sealed = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, info.fields.find((f) => f.key === k)?.secret ? sealSecret(v, place(agentId, id, k)) : v]));
  const at = now();
  await db()
    .prepare(
      `INSERT INTO integrations (id, agent_id, kind, config, enabled, status, detail, secret, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET config = excluded.config, enabled = excluded.enabled, status = 'connected', detail = excluded.detail, updated_at = excluded.updated_at`,
    )
    .run(id, agentId, input.kind, JSON.stringify(sealed), (input.enabled ?? before?.enabled ?? true) ? 1 : 0, detail, sealSecret(secret, place(agentId, id, "webhook")), before?.createdAt ?? at, at);
  return { integration: (await getIntegration(id))! };
}

export async function setIntegrationEnabled(id: string, enabled: boolean): Promise<void> {
  await db().prepare("UPDATE integrations SET enabled = ?, updated_at = ? WHERE id = ?").run(enabled ? 1 : 0, now(), id);
}

/** Disconnects: a Telegram bot stops sending to Keel; the conversations it had stay. */
export async function deleteIntegration(id: string): Promise<void> {
  const i = await getIntegration(id);
  if (!i) return;
  if (i.kind === "telegram" && i.config.botToken) await disconnectTelegram(i.config.botToken).catch(() => {});
  await db().prepare("DELETE FROM integrations WHERE id = ?").run(id);
}

/** Records how the last call to the platform went, for the builder. */
async function mark(id: string, ok: boolean, detail?: string): Promise<void> {
  await db()
    .prepare("UPDATE integrations SET status = ?, detail = COALESCE(?, detail), last_at = ? WHERE id = ?")
    .run(ok ? "connected" : "error", detail ?? null, now(), id);
}

// ── Messages from the apps ───────────────────────────────────────────────────────────────────────────────────────

/** The connection a webhook call is for, with its business: the address is what says which business it is. */
async function connectionFor(id: string): Promise<{ workspaceId: string; integration: Integration } | undefined> {
  const found = await system().prepare("SELECT workspace_id FROM integrations WHERE id = ?").get<{ workspace_id: string }>(id);
  if (!found) return undefined;
  const integration = await withTenant(found.workspace_id, () => getIntegration(id));
  return integration ? { workspaceId: found.workspace_id, integration } : undefined;
}

/** Meta's check when the builder saves the webhook address: the verify token must match. Returns the challenge to echo. */
export async function verifyWebhook(id: string, mode: string | null, token: string | null, challenge: string | null): Promise<string | undefined> {
  const c = await connectionFor(id);
  if (!c || mode !== "subscribe" || !token || token !== c.integration.secret || !challenge) return undefined;
  await withTenant(c.workspaceId, () => mark(id, true));
  return challenge;
}

/**
 * A webhook call from a platform: checked (Meta's signature, Telegram's secret header), then each new customer message
 * is answered in the background, so the platform hears back at once. Returns the HTTP status to answer with.
 */
export async function receiveWebhook(id: string, rawBody: string, headers: Headers): Promise<number> {
  const c = await connectionFor(id);
  if (!c) return 404;
  if (c.integration.kind === "zendesk" || c.integration.kind === "freshdesk") return receiveDeskWebhook(c, rawBody, headers);
  if (!isMessaging(c.integration.kind)) return 404;
  const { integration, workspaceId } = c;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return 400;
  }
  let messages: Inbound[];
  if (integration.kind === "telegram") {
    if (headers.get("x-telegram-bot-api-secret-token") !== integration.secret) return 401;
    const m = parseTelegram(body);
    messages = m ? [m] : [];
  } else {
    if (!metaSignatureValid(rawBody, headers.get("x-hub-signature-256"), integration.config.appSecret ?? "")) return 401;
    messages = parseMeta(body);
  }
  if (!integration.enabled) return 200;
  for (const m of messages) void inBackground(withTenant(workspaceId, () => answer(integration, m)).catch(() => {}));
  return 200;
}

const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * A helpdesk telling Keel that one of its tickets changed (a Zendesk trigger, a Freshdesk automation), with Keel's
 * token: the replies the team wrote there that the customer hasn't had yet are posted in the customer's chat, in the
 * background, so the helpdesk hears back at once. The call only names the ticket; the replies are read from the
 * helpdesk's own API, so nothing in the call itself reaches a customer.
 */
async function receiveDeskWebhook(c: { workspaceId: string; integration: Integration }, rawBody: string, headers: Headers): Promise<number> {
  const token = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || (headers.get("x-keel-token") ?? "").trim();
  if (!token || !c.integration.secret || !sameSecret(token, c.integration.secret)) return 401;
  let ticketId = "";
  try {
    const body = JSON.parse(rawBody) as { ticket_id?: unknown; ticket?: { id?: unknown } };
    ticketId = String(body.ticket_id ?? body.ticket?.id ?? "").trim();
  } catch {
    return 400;
  }
  if (!/^\d{1,20}$/.test(ticketId)) return 400;
  if (!c.integration.enabled) return 200;
  void inBackground(withTenant(c.workspaceId, () => relayDeskReplies(c.integration, ticketId)).catch(() => {}));
  return 200;
}

/** Posts the team's replies on a helpdesk ticket in the chat of the Keel ticket it was made from, each one once. */
export async function relayDeskReplies(integration: Integration, externalId: string): Promise<number> {
  const kind = integration.kind as "zendesk" | "freshdesk";
  const ticket = await db().prepare("SELECT id FROM tickets WHERE agent_id = ? AND (external::jsonb ->> ?) = ?").get<{ id: string }>(integration.agentId, kind, externalId);
  if (!ticket) return 0;
  let replies: HelpdeskReply[];
  try {
    replies = kind === "zendesk" ? await zendeskReplies(integration.config as unknown as ZendeskConfig, externalId) : await freshdeskReplies(integration.config as unknown as FreshdeskConfig, externalId);
    await mark(integration.id, true);
  } catch (error) {
    await mark(integration.id, false, (error as Error).message);
    return 0;
  }
  const { replyAsTeam } = await import("./helpdesk");
  let relayed = 0;
  for (const r of replies) {
    const fresh = await db().prepare("INSERT INTO inbound_seen (integration_id, message_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(integration.id, `reply:${externalId}:${r.id}`, now());
    if (!fresh.changes) continue;
    await replyAsTeam(ticket.id, r.body, { name: r.author ?? `Your team in ${INTEGRATION_INFO[kind].title}` }, { from: kind });
    relayed++;
  }
  return relayed;
}

type Thread = { conversation_id: string };

/** Answers one customer message through the agent, in the conversation that customer has on this app. */
async function answer(integration: Integration, m: Inbound): Promise<void> {
  // Platforms deliver a message again when they don't hear back in time: each is answered once.
  const fresh = await db().prepare("INSERT INTO inbound_seen (integration_id, message_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(integration.id, m.messageId, now());
  if (!fresh.changes) return;
  const agent = await getAgent(integration.agentId);
  if (!agent || !agent.enabled) return;
  const kind = integration.kind as MessagingKind;
  let thread = await db().prepare("SELECT conversation_id FROM channel_threads WHERE integration_id = ? AND external_id = ?").get<Thread>(integration.id, m.from);
  if (!thread) {
    const conversationId = await startConversation(agent.id, kind, { from: m.from, ...(m.name ? { name: m.name } : {}) });
    const contact = await upsertContact({ workspaceId: agent.workspaceId, agentId: agent.id, name: m.name, externalId: `${kind}:${m.from}`, ...(kind === "whatsapp" ? { phone: `+${m.from}` } : {}) });
    await db().prepare("UPDATE conversations SET contact_id = ? WHERE id = ?").run(contact.id, conversationId);
    await db().prepare("INSERT INTO channel_threads (integration_id, external_id, conversation_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING").run(integration.id, m.from, conversationId, m.name ?? null, now(), now());
    thread = { conversation_id: conversationId };
  }
  // A photo is read by NVIDIA's vision model, in the turn, with the customer's words (src/platform/pictures.ts).
  let picture: Picture | undefined;
  if (m.photo) {
    const keys = { botToken: integration.config.botToken, accessToken: integration.config.accessToken ?? integration.config.pageAccessToken };
    picture = await photoFrom(m.photo, keys).then(asPicture, () => undefined);
  }
  const message =
    m.text.trim() ||
    (picture ? "" : m.photo ? "(The customer sent a photo, which couldn't be fetched. Ask them to describe it in words.)" : "(The customer sent a voice note or file, which you can't see. Ask them to write their question.)");
  const turn = await converse({ agent, channel: kind, conversationId: thread.conversation_id, message, picture });
  // While a person from the team has the conversation, the agent stays quiet: the team replies from the Helpdesk.
  if (turn.status === "with_team" || !turn.reply.text.trim()) return;
  await deliver(integration, m.from, withWidgets(turn.reply.text, turn.reply.widgets));
}

/** What a chat widget becomes in a messaging app, which can't show it: the same details as text. */
export function withWidgets(text: string, widgets: ChatWidget[]): string {
  const extra = widgets.flatMap((w): string[] => {
    switch (w.type) {
      case "button":
        return [`${w.label}: ${w.url}`];
      case "form":
        return [`${w.title}. Please reply with: ${w.fields.map((f) => f.label.toLowerCase()).join(", ")}.`];
      case "cards":
        return [w.items.map((c) => [`• ${c.title}`, c.price, c.subtitle, c.link].filter(Boolean).join(" · ")).join("\n")];
      case "tracker":
        return [[w.title, w.steps.map((s, i) => `${i < w.current ? "✓" : i === w.current ? "→" : "○"} ${s}`).join("\n")].filter(Boolean).join("\n")];
      case "slots":
        return [[w.title ?? "Times to choose from", ...w.options.map((o) => `• ${o}`)].join("\n")];
      case "table":
        return [w.rows.map((r) => r.map((v, i) => (w.columns[i] ? `${w.columns[i]}: ${v}` : v)).join(" · ")).join("\n")];
      case "summary":
        return [[w.title, ...w.rows.map((r) => `${r.label}: ${r.value}`)].filter(Boolean).join("\n")];
    }
  });
  return [text, ...extra.filter((e) => e.trim())].join("\n\n");
}

/** Sends a message to a customer on the app, in as many parts as the app needs. */
async function deliver(integration: Integration, to: string, text: string, options: { fromTeam?: boolean } = {}): Promise<void> {
  const kind = integration.kind as MessagingKind;
  const c = integration.config;
  try {
    for (const part of forMessaging(kind, text)) {
      if (kind === "whatsapp") await sendWhatsApp({ phoneNumberId: c.phoneNumberId, accessToken: c.accessToken }, to, part);
      else if (kind === "messenger") await sendMessenger({ pageId: c.pageId, pageAccessToken: c.pageAccessToken }, to, part, options);
      else if (kind === "instagram") await sendInstagram(instagramConfig(c), to, part, options);
      else await sendTelegram(c.botToken, to, part);
    }
    await mark(integration.id, true);
  } catch (error) {
    await mark(integration.id, false, (error as Error).message);
    throw error;
  }
}

/**
 * A reply from the team, for a conversation that came from a messaging app: sent to the customer there. Returns what
 * went wrong, for the ticket's history, when the app wouldn't take it (WhatsApp, Messenger and Instagram only accept
 * replies within 24 hours of the customer's last message, Messenger and Instagram up to 7 days for a person).
 */
export async function deliverTeamReply(conversationId: string, text: string): Promise<{ ok: true } | { ok: false; error: string } | undefined> {
  const thread = await db().prepare("SELECT integration_id, external_id FROM channel_threads WHERE conversation_id = ?").get<{ integration_id: string; external_id: string }>(conversationId);
  if (!thread) return undefined;
  const integration = await getIntegration(thread.integration_id);
  if (!integration) return { ok: false, error: "The app this customer wrote from has been disconnected." };
  try {
    await deliver(integration, thread.external_id, text, { fromTeam: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `${INTEGRATION_INFO[integration.kind].title} didn't deliver it: ${(error as Error).message}` };
  }
}
