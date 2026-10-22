import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { forMessaging } from "@/core/integrations";
import { db } from "@/lib/db";
import { metaSignatureValid, parseMeta, parseTelegram } from "@/lib/messaging";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { listTickets, replyAsTeam, ticketEvents } from "./helpdesk";
import { getIntegration, receiveWebhook, saveIntegration, verifyWebhook, viewOf, withWidgets } from "./integrations";
import { queueTraining, settled } from "./knowledge/jobs";
import { addSource, conversationMessages, createAgent, startConversation } from "./store";
import { createAction, runAction, toolSpec } from "./actions";
import { listSubmissions } from "./submissions";

// Model calls here: a few replies from the agent to messages that came from Telegram and WhatsApp.
const { skip } = live("integrations", 40_000);

/** The platforms' own servers, stood in for: what Keel sends them is kept, and they answer as they would. */
const sent: { url: string; body: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!/^https:\/\/(api\.telegram\.org|graph\.facebook\.com|graph\.instagram\.com)\//.test(url)) return realFetch(input, init);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  sent.push({ url, body });
  if (url.includes("/getMe")) return Response.json({ ok: true, result: { username: "harbor_goods_bot" } });
  // A customer's photo: where Telegram keeps it, then the file itself.
  if (url.includes("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/file_1.png" } });
  if (url.includes("/file/bot")) return new Response(readFileSync(new URL("../testing/fixtures/broken-mug.png", import.meta.url)), { headers: { "Content-Type": "image/png" } });
  if (url.includes("api.telegram.org")) return Response.json({ ok: true, result: true });
  if (url.includes("fields=display_phone_number")) return Response.json({ display_phone_number: "+44 20 7946 0000", verified_name: "Harbor Goods" });
  if (url.includes("refuse-me")) return Response.json({ error: { message: "(#131047) Re-engagement message: more than 24 hours have passed" } }, { status: 400 });
  return Response.json({ messages: [{ id: "wamid.out" }] });
}) as typeof fetch;

const BASE = "https://keel.example.com";

async function shop() {
  const { workspace } = await signUp({ email: `m${Math.random().toString(36).slice(2)}@example.com`, name: "Mo", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = await createAgent(workspace.id, "Harbor Goods", { industry: "retail" });
  return { workspace, agent };
}

test("replies are written for each app: no citation marks, WhatsApp's own bold, and long ones in parts", () => {
  assert.equal(forMessaging("telegram", "Returns are free [1]. **30 days** to return [2].")[0], "Returns are free. 30 days to return.");
  assert.equal(forMessaging("whatsapp", "You have **30 days** [1].")[0], "You have *30 days*.");
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about our delivery times and costs.`).join(" ");
  const parts = forMessaging("instagram", long);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 950), "Instagram's limit is kept");
  assert.equal(parts.join(" ").replace(/\s+/g, " "), long, "and nothing is lost");
});

test("webhooks are read the way each platform sends them, and only Meta's own signature is accepted", () => {
  const whatsapp = { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, contacts: [{ wa_id: "447700900123", profile: { name: "Ana" } }], messages: [{ from: "447700900123", id: "wamid.1", type: "text", text: { body: "Hi" } }] } }] }] };
  assert.deepEqual(parseMeta(whatsapp), [{ from: "447700900123", messageId: "wamid.1", text: "Hi", name: "Ana", to: "111" }]);
  const messenger = { object: "page", entry: [{ id: "PAGE", messaging: [{ sender: { id: "PSID" }, recipient: { id: "PAGE" }, message: { mid: "m.1", text: "Hello" } }, { sender: { id: "PAGE" }, message: { mid: "m.2", text: "echo", is_echo: true } }] }] };
  assert.deepEqual(parseMeta(messenger), [{ from: "PSID", messageId: "m.1", text: "Hello", to: "PAGE" }], "the page's own echoes are left out");
  assert.deepEqual(parseTelegram({ message: { message_id: 7, chat: { id: 42 }, from: { first_name: "Ana" }, text: "Hi" } }), { from: "42", messageId: "7", text: "Hi", name: "Ana" });
  const raw = JSON.stringify(whatsapp);
  const good = `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  assert.equal(metaSignatureValid(raw, good, "app-secret"), true);
  assert.equal(metaSignatureValid(raw, good, "another-secret"), false);
  assert.equal(metaSignatureValid(`${raw} `, good, "app-secret"), false, "a changed body fails");
});

test("connecting checks the keys with the platform first, points a Telegram bot at Keel, and keeps secrets sealed", async () => {
  const { agent } = await shop();
  assert.match(String(("error" in (await saveIntegration(agent.id, { kind: "telegram", config: { botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ" } }, "http://localhost:3000")) ? "refused" : "")), /refused/, "a local address can't be reached by Telegram");
  const saved = await saveIntegration(agent.id, { kind: "telegram", config: { botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ" } }, BASE);
  assert.ok("integration" in saved, JSON.stringify(saved));
  const i = saved.integration;
  assert.equal(i.detail, "@harbor_goods_bot");
  const hook = sent.find((s) => s.url.includes("/setWebhook"))!;
  assert.equal(hook.body.url, `${BASE}/api/integrations/${i.id}/webhook`);
  assert.equal(hook.body.secret_token, i.secret, "Telegram sends the secret back with every message");
  const stored = await db().prepare("SELECT config FROM integrations WHERE id = ?").get<{ config: string }>(i.id);
  assert.doesNotMatch(stored!.config, /ABCDEFGHIJ/, "the bot token is stored sealed");
  assert.equal(viewOf(i, BASE).config.botToken, "••••••••", "and the page only ever sees it masked");
});

test("a customer on Telegram gets the agent's answer there; the team's reply goes back to them in Telegram", { skip }, async () => {
  const { workspace, agent } = await shop();
  await createAction(agent.id, "handoff");
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Returns", content: "You can return any item within 30 days of delivery for a full refund. Returns are free in the UK." })).id);
  await settled();
  const saved = await saveIntegration(agent.id, { kind: "telegram", config: { botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ" } }, BASE);
  assert.ok("integration" in saved);
  const i = saved.integration;
  const update = (id: number, text: string) => JSON.stringify({ update_id: id, message: { message_id: id, chat: { id: 4242, type: "private" }, from: { first_name: "Ana" }, text } });
  const headers = new Headers({ "x-telegram-bot-api-secret-token": i.secret });

  assert.equal(await receiveWebhook(i.id, update(1, "How long do I have to return something?"), new Headers()), 401, "without Telegram's secret, nothing happens");
  sent.length = 0;
  assert.equal(await receiveWebhook(i.id, update(1, "How long do I have to return something?"), headers), 200);
  await receiveWebhook(i.id, update(1, "How long do I have to return something?"), headers);
  await settled();
  const replies = sent.filter((s) => s.url.includes("/sendMessage"));
  assert.equal(replies.length, 1, "a message delivered twice is answered once");
  assert.equal(replies[0].body.chat_id, "4242");
  assert.match(String(replies[0].body.text), /30\sdays/);
  assert.doesNotMatch(String(replies[0].body.text), /\[\d\]/, "without citation marks");

  sent.length = 0;
  await receiveWebhook(i.id, update(2, "I want to talk to a real person from your team, please."), headers);
  await settled();
  const [ticket] = await listTickets(workspace.id, "all", "nobody");
  assert.ok(ticket, "the handover opened a ticket");
  const conversation = await conversationMessages(ticket.conversationId!);
  assert.equal(conversation.filter((m) => m.role === "user").length, 2, "both messages are one conversation");

  sent.length = 0;
  await replyAsTeam(ticket.id, "Hi Ana, Sam here. How can I help?", { id: "usr_sam", name: "Sam" });
  assert.equal(sent.filter((s) => s.url.includes("/sendMessage")).at(-1)?.body.text, "Hi Ana, Sam here. How can I help?", "the team's reply reaches Telegram");
  assert.equal((await getIntegration(i.id))?.status, "connected");
});

test("WhatsApp: Meta's verify handshake, signed messages only, and a reply WhatsApp refuses is said so in the ticket", { skip }, async () => {
  const { workspace, agent } = await shop();
  await createAction(agent.id, "handoff");
  const saved = await saveIntegration(agent.id, { kind: "whatsapp", config: { phoneNumberId: "111", accessToken: "token", appSecret: "app-secret" } }, BASE);
  assert.ok("integration" in saved, JSON.stringify(saved));
  const i = saved.integration;
  assert.equal(i.detail, "Harbor Goods · +44 20 7946 0000");
  assert.equal(await verifyWebhook(i.id, "subscribe", i.secret, "challenge-123"), "challenge-123");
  assert.equal(await verifyWebhook(i.id, "subscribe", "wrong", "challenge-123"), undefined);

  const body = JSON.stringify({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "111" }, contacts: [{ wa_id: "447700900123", profile: { name: "Ana" } }], messages: [{ from: "447700900123", id: "wamid.in1", type: "text", text: { body: "Can I speak to someone from your team?" } }] } }] }] });
  assert.equal(await receiveWebhook(i.id, body, new Headers({ "x-hub-signature-256": "sha256=forged" })), 401);
  sent.length = 0;
  assert.equal(await receiveWebhook(i.id, body, new Headers({ "x-hub-signature-256": `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}` })), 200);
  await settled();
  const out = sent.find((s) => s.url.endsWith("/111/messages"));
  assert.equal(out?.body.to, "447700900123");
  assert.equal(out?.body.messaging_product, "whatsapp");

  const [ticket] = await listTickets(workspace.id, "all", "nobody");
  // The business's access token stopped working: the team sees why the customer didn't get the reply.
  await db().prepare("UPDATE integrations SET config = ? WHERE id = ?").run(JSON.stringify({ ...JSON.parse((await db().prepare("SELECT config FROM integrations WHERE id = ?").get<{ config: string }>(i.id))!.config), phoneNumberId: "refuse-me" }), i.id);
  await replyAsTeam(ticket.id, "Hi Ana, Sam here.", { id: "usr_sam", name: "Sam" });
  const note = (await ticketEvents(ticket.id)).find((e) => e.kind === "note");
  assert.match(note?.body ?? "", /WhatsApp didn't deliver it: .*24 hours/);
  assert.equal((await getIntegration(i.id))?.status, "error", "and the connection shows it needs attention");
});

test("chat cards reach a messaging app as text: nothing the chat would show is lost", () => {
  const text = withWidgets("Here's your order.", [
    { type: "tracker", title: "Order HG-1043", steps: ["Ordered", "Packed", "Shipped", "Delivered"], current: 2 },
    { type: "cards", items: [{ title: "Harbour mug", price: "£18", link: "https://harbor.example/mug" }] },
    { type: "slots", options: ["Sat 9:30am", "Sat 11am"] },
    { type: "summary", title: "Booking", rows: [{ label: "Date", value: "12 Nov" }] },
    { type: "table", columns: ["Size", "Price"], rows: [["20 cm", "£16"]] },
  ]);
  assert.equal(
    text,
    "Here's your order.\n\nOrder HG-1043\n✓ Ordered\n✓ Packed\n→ Shipped\n○ Delivered\n\n• Harbour mug · £18 · https://harbor.example/mug\n\nTimes to choose from\n• Sat 9:30am\n• Sat 11am\n\nBooking\nDate: 12 Nov\n\nSize: 20 cm · Price: £16",
  );
});

test("on a messaging app, a form is filled in the conversation, and the answers are saved like a filled-in form", async () => {
  const { workspace } = await signUp({ email: `f${Math.random().toString(36).slice(2)}@example.com`, name: "Fay", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = await createAgent(workspace.id, "Harbor Goods");
  const lead = await createAction(agent.id, "lead");
  const required = (toolSpec(lead, { conversational: true }).parameters as { required?: string[] }).required;
  assert.deepEqual(required, ["name", "email"], "the form's required fields are what the agent must collect");
  assert.deepEqual((toolSpec(lead).parameters as { required?: string[] }).required ?? [], [], "on the website, the form itself collects them");

  const conversationId = await startConversation(agent.id, "telegram");
  const short = await runAction(lead, JSON.stringify({ name: "Ana" }), { agent, conversationId, messaging: true });
  assert.equal((short.result as { saved: boolean }).saved, false, "a missing email is asked for, not saved");
  const saved = await runAction(lead, JSON.stringify({ name: "Ana", email: "ana@cafe.example" }), { agent, conversationId, messaging: true });
  assert.equal(saved.widget, undefined, "no form to show in a messaging app");
  const [submission] = await listSubmissions(agent.id, ["lead"]);
  assert.deepEqual([submission.data.email, submission.conversationId], ["ana@cafe.example", conversationId]);
  assert.ok(submission.contactId, "and the lead becomes a contact");
});

test("a photo sent on Telegram is fetched from Telegram and read by NVIDIA's vision model, for the agent and the team", { skip }, async () => {
  const { agent } = await shop();
  const saved = await saveIntegration(agent.id, { kind: "telegram", config: { botToken: "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ" } }, BASE);
  assert.ok("integration" in saved);
  const i = saved.integration;
  const update = JSON.stringify({ update_id: 9, message: { message_id: 9, chat: { id: 5151, type: "private" }, from: { first_name: "Sam" }, caption: "This came today", photo: [{ file_id: "photo-1", file_size: 13_000 }] } });
  sent.length = 0;
  assert.equal(await receiveWebhook(i.id, update, new Headers({ "x-telegram-bot-api-secret-token": i.secret })), 200);
  await settled();
  assert.ok(sent.some((x) => x.url.includes("/getFile")), "the photo is fetched with the bot's own key");
  const [thread] = await db().prepare("SELECT conversation_id FROM channel_threads WHERE integration_id = ?").all<{ conversation_id: string }>(i.id);
  const [asked] = (await conversationMessages(thread.conversation_id)).filter((m) => m.role === "user");
  assert.match(asked.content, /^This came today\n\n\[The customer sent a photo\. What it shows: [\s\S]*(crack|chip|broken|damag)/i);
  assert.ok(sent.some((x) => x.url.includes("/sendMessage")), "and the customer gets an answer");
});
