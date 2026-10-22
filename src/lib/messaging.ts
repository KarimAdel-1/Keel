// Talking to the platforms a business connects: WhatsApp, Messenger and Instagram (Meta's Graph API), Telegram's Bot
// API, Slack's incoming webhooks, and the Zendesk and Freshdesk APIs. Their official HTTP APIs, called directly. Every
// failure comes back as an IntegrationError with the platform's own words, for the builder to read.

import { createHmac, timingSafeEqual } from "node:crypto";
import { publicFetch } from "./net";
import { setting } from "./settings";

export class IntegrationError extends Error {}

const TIMEOUT_MS = 15_000;

/** A JSON call; the platform's error message, when it gives one, is kept. */
async function call<T>(platform: string, url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { Accept: "application/json", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new IntegrationError(`${platform} couldn't be reached (${(error as Error).name === "TimeoutError" ? "it took too long" : "network error"}).`);
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) {
    const b = body as { error?: { message?: string } | string; description?: string; message?: string; errors?: unknown };
    const said = typeof b?.error === "object" ? b.error?.message : typeof b?.error === "string" ? b.error : (b?.description ?? b?.message ?? (typeof body === "string" ? body.slice(0, 200) : ""));
    throw new IntegrationError(`${platform} said: ${said || `error ${res.status}`}`.slice(0, 400));
  }
  return body as T;
}

// ── Meta: WhatsApp, Messenger, Instagram ─────────────────────────────────────────────────────────────────────────

/** The Graph API version Keel calls (Meta retires old ones about two years after release). */
export const graphVersion = () => setting("META_GRAPH_VERSION");
const graph = (host: "facebook" | "instagram" = "facebook") => `https://graph.${host}.com/${graphVersion()}`;

/** Whether a webhook POST really came from Meta: its X-Hub-Signature-256 is the app secret's HMAC of the raw body. */
export function metaSignatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export interface Inbound {
  /** Who wrote: the WhatsApp number, the Messenger or Instagram id, the Telegram chat. */
  from: string;
  name?: string;
  /** The platform's id for the message, so a retried delivery isn't answered twice. */
  messageId: string;
  /** The text (a photo's caption); empty for a photo without one, a voice note or a sticker. */
  text: string;
  /** The account that received it (phone number id, Page id, Instagram account id, bot). */
  to?: string;
  /** A photo with it, as the platform names it: fetched with photoFrom(). */
  photo?: InboundPhoto;
}

/** Where a customer's photo is: a Telegram file, a WhatsApp media item, or a Messenger or Instagram attachment's address. */
export type InboundPhoto = { via: "telegram"; fileId: string } | { via: "whatsapp"; mediaId: string } | { via: "url"; url: string };

type MetaEntry = {
  id?: string;
  changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: { from?: string; id?: string; type?: string; text?: { body?: string }; image?: { id?: string; caption?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } }[] } }[];
  messaging?: { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean; quick_reply?: { payload?: string }; attachments?: { type?: string; payload?: { url?: string } }[] }; postback?: { mid?: string; title?: string } }[];
};

/** The customer messages in a Meta webhook delivery (echoes of the business's own messages and receipts are left out). */
export function parseMeta(body: unknown): Inbound[] {
  const out: Inbound[] = [];
  const entries = ((body as { entry?: MetaEntry[] })?.entry ?? []) as MetaEntry[];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (change.field !== "messages" || !v?.messages) continue;
      for (const m of v.messages) {
        if (!m.from || !m.id) continue;
        const text = m.text?.body ?? m.image?.caption ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";
        const photo = m.type === "image" && m.image?.id ? { via: "whatsapp" as const, mediaId: m.image.id } : undefined;
        out.push({ from: m.from, messageId: m.id, text, name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name, to: v.metadata?.phone_number_id, ...(photo ? { photo } : {}) });
      }
    }
    for (const e of entry.messaging ?? []) {
      if (!e.sender?.id || e.message?.is_echo) continue;
      const id = e.message?.mid ?? e.postback?.mid;
      if (!id) continue;
      const image = e.message?.attachments?.find((a) => a.type === "image" && a.payload?.url)?.payload?.url;
      out.push({ from: e.sender.id, messageId: id, text: e.message?.text ?? e.postback?.title ?? "", to: e.recipient?.id ?? entry.id, ...(image ? { photo: { via: "url" as const, url: image } } : {}) });
    }
  }
  return out;
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
}

export async function sendWhatsApp(c: WhatsAppConfig, to: string, text: string): Promise<void> {
  await call("WhatsApp", `${graph()}/${encodeURIComponent(c.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.accessToken}` },
    json: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: text } },
  });
}

/** The connected number, as WhatsApp shows it: a check that the ID and token work. */
export async function checkWhatsApp(c: WhatsAppConfig): Promise<string> {
  const r = await call<{ display_phone_number?: string; verified_name?: string }>("WhatsApp", `${graph()}/${encodeURIComponent(c.phoneNumberId)}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${c.accessToken}` },
  });
  return [r.verified_name, r.display_phone_number].filter(Boolean).join(" · ") || "Connected";
}

export interface MessengerConfig {
  pageId: string;
  pageAccessToken: string;
}

/**
 * A Messenger message. The agent answers within Messenger's 24-hour window; a person from the team replying later goes
 * out with the human agent tag (allowed for 7 days when the app has that permission).
 */
export async function sendMessenger(c: MessengerConfig, to: string, text: string, options: { fromTeam?: boolean } = {}): Promise<void> {
  const url = `${graph()}/${encodeURIComponent(c.pageId)}/messages?access_token=${encodeURIComponent(c.pageAccessToken)}`;
  try {
    await call("Messenger", url, { method: "POST", json: { recipient: { id: to }, messaging_type: "RESPONSE", message: { text } } });
  } catch (error) {
    if (!options.fromTeam) throw error;
    await call("Messenger", url, { method: "POST", json: { recipient: { id: to }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text } } });
  }
}

export async function checkMessenger(c: MessengerConfig): Promise<string> {
  const r = await call<{ name?: string }>("Messenger", `${graph()}/${encodeURIComponent(c.pageId)}?fields=name&access_token=${encodeURIComponent(c.pageAccessToken)}`);
  return r.name ?? "Connected";
}

export interface InstagramConfig {
  accountId: string;
  accessToken: string;
  /** Instagram login (graph.instagram.com) or a linked Facebook Page (graph.facebook.com). */
  api: "instagram" | "facebook";
  pageId?: string;
}

export async function sendInstagram(c: InstagramConfig, to: string, text: string, options: { fromTeam?: boolean } = {}): Promise<void> {
  const sender = c.api === "facebook" ? c.pageId || c.accountId : c.accountId;
  const url = `${graph(c.api)}/${encodeURIComponent(sender)}/messages`;
  const headers = { Authorization: `Bearer ${c.accessToken}` };
  try {
    await call("Instagram", url, { method: "POST", headers, json: { recipient: { id: to }, message: { text } } });
  } catch (error) {
    if (!options.fromTeam) throw error;
    await call("Instagram", url, { method: "POST", headers, json: { recipient: { id: to }, messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT", message: { text } } });
  }
}

export async function checkInstagram(c: InstagramConfig): Promise<string> {
  const r = await call<{ username?: string }>("Instagram", `${graph(c.api)}/${encodeURIComponent(c.accountId)}?fields=username`, { headers: { Authorization: `Bearer ${c.accessToken}` } });
  return r.username ? `@${r.username}` : "Connected";
}

// ── Telegram ─────────────────────────────────────────────────────────────────────────────────────────────────────

const telegram = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;
type TelegramResult<T> = { ok: boolean; result: T; description?: string };

async function telegramCall<T>(token: string, method: string, json?: unknown): Promise<T> {
  if (!/^\d+:[\w-]{20,}$/.test(token)) throw new IntegrationError("That doesn't look like a bot token from @BotFather (it looks like 123456:ABC-DEF…).");
  const r = await call<TelegramResult<T>>("Telegram", telegram(token, method), json !== undefined ? { method: "POST", json } : {});
  if (!r.ok) throw new IntegrationError(`Telegram said: ${r.description ?? "it didn't work"}`);
  return r.result;
}

/** The bot's @username: a check that the token works. */
export async function checkTelegram(token: string): Promise<string> {
  const me = await telegramCall<{ username?: string; first_name?: string }>(token, "getMe");
  return me.username ? `@${me.username}` : (me.first_name ?? "Connected");
}

/** Points the bot at Keel: Telegram then sends each message here, with the secret in a header. */
export async function connectTelegram(token: string, url: string, secret: string): Promise<void> {
  await telegramCall(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
}

export async function disconnectTelegram(token: string): Promise<void> {
  await telegramCall(token, "deleteWebhook", { drop_pending_updates: false });
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  await telegramCall(token, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true } });
}

/** The customer message in a Telegram update, if it is one. */
export function parseTelegram(body: unknown): Inbound | undefined {
  type Size = { file_id?: string; file_size?: number; width?: number };
  const m = (body as { message?: { message_id?: number; text?: string; caption?: string; photo?: Size[]; document?: { file_id?: string; mime_type?: string }; chat?: { id?: number; type?: string }; from?: { first_name?: string; last_name?: string; username?: string; is_bot?: boolean } } })?.message;
  if (!m?.chat?.id || !m.message_id || m.from?.is_bot) return undefined;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username;
  // Telegram sends each photo in several sizes, smallest first: the largest under 5 MB, a picture sent as a file too.
  const size = (m.photo ?? []).filter((p) => p.file_id && (p.file_size ?? 0) <= 5_000_000).at(-1);
  const fileId = size?.file_id ?? (m.document?.mime_type?.startsWith("image/") ? m.document.file_id : undefined);
  return { from: String(m.chat.id), messageId: String(m.message_id), text: m.text ?? m.caption ?? "", ...(name ? { name } : {}), ...(fileId ? { photo: { via: "telegram" as const, fileId } } : {}) };
}

// ── Customers' photos ────────────────────────────────────────────────────────────────────────────────────────────

/** The largest photo fetched from a platform. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

async function download(platform: string, url: string, init: RequestInit = {}, guarded = false): Promise<Buffer> {
  let res: Response;
  try {
    res = await (guarded ? publicFetch : fetch)(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new IntegrationError(`${platform} didn't send the photo.`);
  }
  if (!res.ok) throw new IntegrationError(`${platform} didn't send the photo (error ${res.status}).`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) throw new IntegrationError("The photo is too large.");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) throw new IntegrationError("The photo is too large.");
  return bytes;
}

/** A customer's photo, fetched from the platform it came from with the connection's own keys. */
export async function photoFrom(photo: InboundPhoto, keys: { botToken?: string; accessToken?: string }): Promise<Buffer> {
  if (photo.via === "telegram") {
    const r = await call<{ result?: { file_path?: string } }>("Telegram", `https://api.telegram.org/bot${keys.botToken}/getFile?file_id=${encodeURIComponent(photo.fileId)}`);
    if (!r.result?.file_path) throw new IntegrationError("Telegram didn't send the photo.");
    return download("Telegram", `https://api.telegram.org/file/bot${keys.botToken}/${r.result.file_path}`);
  }
  if (photo.via === "whatsapp") {
    const auth = { Authorization: `Bearer ${keys.accessToken}` };
    const r = await call<{ url?: string }>("WhatsApp", `${graph()}/${encodeURIComponent(photo.mediaId)}`, { headers: auth });
    if (!r.url) throw new IntegrationError("WhatsApp didn't send the photo.");
    return download("WhatsApp", r.url, { headers: auth });
  }
  // Messenger and Instagram give the photo's address: fetched like any address from outside, never a private one.
  return download("Meta", photo.url, {}, true);
}

// ── Slack ────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function sendSlack(webhookUrl: string, text: string): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/.test(webhookUrl)) throw new IntegrationError("That isn't a Slack incoming webhook address (it starts with https://hooks.slack.com/services/).");
  let res: Response;
  try {
    res = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new IntegrationError("Slack couldn't be reached.");
  }
  if (!res.ok) throw new IntegrationError(`Slack said: ${(await res.text()).slice(0, 200) || `error ${res.status}`}`);
}

// ── Helpdesks: Zendesk and Freshdesk ─────────────────────────────────────────────────────────────────────────────

export interface NewHelpdeskTicket {
  subject: string;
  /** The conversation and the agent's summary, as plain text. */
  body: string;
  priority: "low" | "normal" | "high";
  requester?: { name?: string; email?: string; phone?: string };
}

const subdomain = (s: string, platform: string) => {
  const clean = s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\.(zendesk|freshdesk)\.com.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(clean)) throw new IntegrationError(`That doesn't look like a ${platform} subdomain (the "yourcompany" part of yourcompany.${platform.toLowerCase()}.com).`);
  return clean;
};

export interface ZendeskConfig {
  subdomain: string;
  email: string;
  apiToken: string;
}

const zendesk = (c: ZendeskConfig) => ({
  base: `https://${subdomain(c.subdomain, "Zendesk")}.zendesk.com/api/v2`,
  headers: { Authorization: `Basic ${Buffer.from(`${c.email.trim()}/token:${c.apiToken}`).toString("base64")}` },
});

export async function checkZendesk(c: ZendeskConfig): Promise<string> {
  const z = zendesk(c);
  const r = await call<{ user?: { name?: string; role?: string } }>("Zendesk", `${z.base}/users/me.json`, { headers: z.headers });
  if (!r.user || r.user.role === "end-user") throw new IntegrationError("Zendesk didn't accept that email and token as an agent.");
  return r.user.name ?? "Connected";
}

/** Creates the ticket in Zendesk; returns its id. */
export async function createZendeskTicket(c: ZendeskConfig, t: NewHelpdeskTicket): Promise<string> {
  const z = zendesk(c);
  const r = await call<{ ticket?: { id?: number } }>("Zendesk", `${z.base}/tickets.json`, {
    method: "POST",
    headers: z.headers,
    json: {
      ticket: {
        subject: t.subject,
        comment: { body: t.body, public: false },
        priority: t.priority === "normal" ? "normal" : t.priority,
        tags: ["keel"],
        ...(t.requester?.email ? { requester: { name: t.requester.name || t.requester.email, email: t.requester.email } } : {}),
      },
    },
  });
  return String(r.ticket?.id ?? "");
}

/** A reply the team wrote in the business's helpdesk, for the customer: its id there, the words, and who wrote it. */
export interface HelpdeskReply {
  id: string;
  body: string;
  author?: string;
}

/** The public replies the business's agents wrote on a Zendesk ticket, oldest first (Keel's own notes are private). */
export async function zendeskReplies(c: ZendeskConfig, ticketId: string): Promise<HelpdeskReply[]> {
  const z = zendesk(c);
  const r = await call<{ comments?: { id: number; author_id: number; public: boolean; plain_body?: string; body?: string }[]; users?: { id: number; name?: string; role?: string }[] }>(
    "Zendesk",
    `${z.base}/tickets/${encodeURIComponent(ticketId)}/comments.json?include=users`,
    { headers: z.headers },
  );
  const users = new Map((r.users ?? []).map((u) => [u.id, u]));
  return (r.comments ?? [])
    .filter((m) => m.public && users.get(m.author_id)?.role !== "end-user" && (m.plain_body ?? m.body ?? "").trim())
    .map((m) => ({ id: String(m.id), body: (m.plain_body ?? m.body ?? "").trim(), ...(users.get(m.author_id)?.name ? { author: users.get(m.author_id)!.name } : {}) }));
}

/** An internal note on a Zendesk ticket: what happened in the chat, for the team working there. */
export async function noteOnZendesk(c: ZendeskConfig, ticketId: string, body: string): Promise<void> {
  const z = zendesk(c);
  await call("Zendesk", `${z.base}/tickets/${encodeURIComponent(ticketId)}.json`, { method: "PUT", headers: z.headers, json: { ticket: { comment: { body, public: false } } } });
}

export interface FreshdeskConfig {
  domain: string;
  apiKey: string;
  fallbackEmail: string;
}

const freshdesk = (c: FreshdeskConfig) => ({
  base: `https://${subdomain(c.domain, "Freshdesk")}.freshdesk.com/api/v2`,
  headers: { Authorization: `Basic ${Buffer.from(`${c.apiKey}:X`).toString("base64")}` },
});

export async function checkFreshdesk(c: FreshdeskConfig): Promise<string> {
  const f = freshdesk(c);
  const r = await call<{ contact?: { name?: string } }>("Freshdesk", `${f.base}/agents/me`, { headers: f.headers });
  return r.contact?.name ?? "Connected";
}

const escapeHtml = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);

/** Creates the ticket in Freshdesk; returns its id. */
export async function createFreshdeskTicket(c: FreshdeskConfig, t: NewHelpdeskTicket): Promise<string> {
  const f = freshdesk(c);
  const email = t.requester?.email || c.fallbackEmail;
  const r = await call<{ id?: number }>("Freshdesk", `${f.base}/tickets`, {
    method: "POST",
    headers: f.headers,
    json: {
      subject: t.subject,
      description: escapeHtml(t.body).replace(/\n/g, "<br>"),
      email,
      ...(t.requester?.name ? { name: t.requester.name } : {}),
      ...(t.requester?.phone ? { phone: t.requester.phone } : {}),
      priority: t.priority === "high" ? 3 : t.priority === "low" ? 1 : 2,
      status: 2,
      source: 7,
      tags: ["keel"],
    },
  });
  return String(r.id ?? "");
}

/** The replies the business's agents sent the customer on a Freshdesk ticket, oldest first (not notes, not the customer's). */
export async function freshdeskReplies(c: FreshdeskConfig, ticketId: string): Promise<HelpdeskReply[]> {
  const f = freshdesk(c);
  const r = await call<{ id: number; body_text?: string; incoming?: boolean; private?: boolean }[]>("Freshdesk", `${f.base}/tickets/${encodeURIComponent(ticketId)}/conversations`, { headers: f.headers });
  return (Array.isArray(r) ? r : []).filter((m) => !m.incoming && !m.private && (m.body_text ?? "").trim()).map((m) => ({ id: String(m.id), body: m.body_text!.trim() }));
}

/** A private note on a Freshdesk ticket. */
export async function noteOnFreshdesk(c: FreshdeskConfig, ticketId: string, body: string): Promise<void> {
  const f = freshdesk(c);
  await call("Freshdesk", `${f.base}/tickets/${encodeURIComponent(ticketId)}/notes`, { method: "POST", headers: f.headers, json: { body: escapeHtml(body).replace(/\n/g, "<br>"), private: true } });
}
