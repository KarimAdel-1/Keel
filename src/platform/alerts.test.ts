import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { sealSecret } from "@/lib/secrets";
import { setTestTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";
import { serveSmtp } from "@/testing/smtp";
import { finishPasswordReset, sessionUser, setUserSettings, signIn, signUp, startPasswordReset, startSession } from "./accounts";
import { ticketsForAlerts } from "./alerts";
import { receiveWebhook } from "./integrations";
import { addNote, assign, customerReplied, openTicket, replyAsTeam } from "./helpdesk";
import { settled } from "./knowledge/jobs";
import { addMessage, conversationMessages, createAgent, startConversation } from "./store";

offline("alerts");

/** Slack, Zendesk and Freshdesk, stood in for: what Keel sends them is kept. */
const sent: { url: string; body: Record<string, unknown>; auth?: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!/hooks\.slack\.com|zendesk\.com|freshdesk\.com/.test(url)) return realFetch(input, init);
  sent.push({ url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
  // The ticket's comments: Keel's private summary, the team's public reply, and the customer's own email reply.
  if (url.includes("/comments.json"))
    return Response.json({
      comments: [
        { id: 1, author_id: 10, public: false, plain_body: "The customer's mug arrived broken." },
        { id: 2, author_id: 20, public: true, plain_body: "Hi, Sam here in Zendesk. A new mug is on its way." },
        { id: 3, author_id: 30, public: true, plain_body: "Thanks!" },
      ],
      users: [{ id: 10, name: "Keel", role: "admin" }, { id: 20, name: "Sam", role: "agent" }, { id: 30, name: "Ana", role: "end-user" }],
    });
  if (url.includes("/conversations"))
    return Response.json([
      { id: 5, body_text: "Hi, Fran here in Freshdesk.", incoming: false, private: false },
      { id: 6, body_text: "Check the stock first", incoming: false, private: true },
      { id: 7, body_text: "Is it sent?", incoming: true, private: false },
    ]);
  if (url.includes("zendesk")) return Response.json({ ticket: { id: 901 } }, { status: 201 });
  if (url.includes("freshdesk")) return Response.json({ id: 77 }, { status: 201 });
  return new Response("ok");
}) as typeof fetch;

/** A connection saved the way Keel saves one, without asking the platform (that's integrations.test.ts). */
async function connect(agentId: string, kind: string, config: Record<string, string>, secretKeys: string[]): Promise<string> {
  const id = `int_${kind}_${Math.random().toString(36).slice(2)}`;
  const sealed = Object.fromEntries(Object.entries(config).map(([k, v]) => [k, secretKeys.includes(k) ? sealSecret(v, `${agentId}/integration.${id}.${k}`) : v]));
  const at = new Date().toISOString();
  await db().prepare("INSERT INTO integrations (id, agent_id, kind, config, enabled, status, detail, secret, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 'connected', '', ?, ?, ?)").run(id, agentId, kind, JSON.stringify(sealed), sealSecret("s", `${agentId}/integration.${id}.webhook`), at, at);
  return id;
}

test("when a customer needs a person: Slack hears it, and the ticket is made in Zendesk and Freshdesk with the conversation", async () => {
  const { user, workspace } = await signUp({ email: `a${Math.random().toString(36).slice(2)}@example.com`, name: "Ari", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = await createAgent(workspace.id, "Harbor Goods", { industry: "retail" });
  await connect(agent.id, "slack", { webhookUrl: "https://hooks.slack.com/services/T000/B000/XXXX" }, ["webhookUrl"]);
  await connect(agent.id, "zendesk", { subdomain: "harbor", email: "desk@harbor.example", apiToken: "zd-token" }, ["apiToken"]);
  await connect(agent.id, "freshdesk", { domain: "harbor", apiKey: "fd-key", fallbackEmail: "support@harbor.example" }, ["apiKey"]);
  const conversationId = await startConversation(agent.id, "widget");
  await addMessage(conversationId, { role: "user", content: "My mug arrived broken and I'd like a replacement." });
  const before = new Date(Date.now() - 1000).toISOString();

  const ticket = await openTicket({ agentId: agent.id, conversationId, subject: "Broken mug", summary: "The customer's mug arrived broken; they want a replacement.", handover: true });
  await settled();
  const slack = sent.find((s) => s.url.includes("slack"));
  assert.match(String(slack?.body.text), /waiting to chat with your team/);
  assert.match(String(slack?.body.text), new RegExp(`/app/helpdesk\\?t=${ticket.id}`), "with a link to answer it");
  const zendesk = sent.find((s) => s.url === "https://harbor.zendesk.com/api/v2/tickets.json");
  assert.equal((zendesk?.body.ticket as { subject?: string }).subject, "Broken mug");
  assert.match(String((zendesk?.body.ticket as { comment?: { body?: string } }).comment?.body), /Customer: My mug arrived broken/, "with the conversation");
  assert.equal(zendesk?.auth, `Basic ${Buffer.from("desk@harbor.example/token:zd-token").toString("base64")}`);
  const freshdesk = sent.find((s) => s.url === "https://harbor.freshdesk.com/api/v2/tickets");
  assert.equal(freshdesk?.body.email, "support@harbor.example", "a customer with no email gets the business's fallback");
  const stored = await db().prepare("SELECT external FROM tickets WHERE id = ?").get<{ external: string }>(ticket.id);
  assert.deepEqual(JSON.parse(stored!.external), { zendesk: "901", freshdesk: "77" }, "and the copies' ids are kept with the ticket");

  // The dashboard's alerts: what customers did, never what the team did.
  assert.deepEqual((await ticketsForAlerts(workspace.id, before)).map((a) => [a.id, a.status]), [[ticket.id, "new"]]);
  const afterOpen = new Date().toISOString();
  await assign(ticket.id, user.id, user.id);
  await addNote(ticket.id, "Checking stock", user.id);
  await replyAsTeam(ticket.id, "Sorry about that! A new one is on its way.", { id: user.id, name: user.name });
  assert.deepEqual(await ticketsForAlerts(workspace.id, afterOpen), [], "the team's own work doesn't alert it");
  sent.length = 0;
  await customerReplied(conversationId);
  await settled();
  assert.deepEqual((await ticketsForAlerts(workspace.id, afterOpen)).map((a) => a.status), ["open"], "the customer writing again does");
  assert.match(String(sent.find((s) => s.url.includes("slack"))?.body.text), /replied to your team/);
  assert.equal(sent.filter((s) => s.url.endsWith("/tickets.json")).length, 0, "and isn't made into another helpdesk ticket");
  const note = sent.find((s) => s.url === "https://harbor.zendesk.com/api/v2/tickets/901.json");
  assert.deepEqual((note?.body.ticket as { comment?: { public?: boolean } }).comment?.public, false, "it's an internal note on the ticket there");
  assert.match(String((note?.body.ticket as { comment?: { body?: string } }).comment?.body), /wrote again in the chat/);
});

test("a reply the team writes in Zendesk or Freshdesk reaches the customer's chat, once; notes and the customer's own words don't", async () => {
  const { workspace } = await signUp({ email: `z${Math.random().toString(36).slice(2)}@example.com`, name: "Zia", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = await createAgent(workspace.id, "Harbor Goods", { industry: "retail" });
  const zendesk = await connect(agent.id, "zendesk", { subdomain: "harbor", email: "desk@harbor.example", apiToken: "zd-token" }, ["apiToken"]);
  const freshdesk = await connect(agent.id, "freshdesk", { domain: "harbor", apiKey: "fd-key", fallbackEmail: "support@harbor.example" }, ["apiKey"]);
  const conversationId = await startConversation(agent.id, "widget");
  await addMessage(conversationId, { role: "user", content: "My mug arrived broken." });
  await openTicket({ agentId: agent.id, conversationId, subject: "Broken mug", summary: "The mug arrived broken.", handover: true });
  await settled();
  const call = (id: string, body: unknown, token = "s") => receiveWebhook(id, JSON.stringify(body), new Headers({ authorization: `Bearer ${token}` }));

  assert.equal(await call(zendesk, { ticket_id: "901" }, "wrong"), 401, "only with Keel's token");
  assert.equal(await call(zendesk, { ticket_id: "not a number" }), 400);
  sent.length = 0;
  assert.equal(await call(zendesk, { ticket_id: "901" }), 200);
  assert.equal(await call(freshdesk, { ticket_id: 77 }), 200);
  await settled();
  assert.equal(await call(zendesk, { ticket_id: "901" }), 200, "the same news twice");
  await settled();
  const team = (await conversationMessages(conversationId)).filter((m) => m.role === "human").map((m) => m.content);
  assert.deepEqual(team.sort(), ["Hi, Fran here in Freshdesk.", "Hi, Sam here in Zendesk. A new mug is on its way."], "each public reply once; never a private note or the customer's words");
  const copied = sent.filter((s) => s.url.endsWith("/notes") || s.url.endsWith("/tickets/901.json"));
  assert.ok(copied.some((s) => s.url.endsWith("/notes") && /Sam replied in Zendesk/.test(String(s.body.body))), "Freshdesk hears what was said in Zendesk");
  assert.ok(!copied.some((s) => s.url.endsWith("/tickets/901.json") && /Sam replied in Zendesk/.test(JSON.stringify(s.body))), "and Zendesk isn't told its own reply");
});

test("one business never sees another's alerts", async () => {
  const a = await signUp({ email: `b${Math.random().toString(36).slice(2)}@example.com`, name: "Bo", password: "long enough" });
  const b = await signUp({ email: `c${Math.random().toString(36).slice(2)}@example.com`, name: "Cy", password: "long enough" });
  setTestTenant(a.workspace.id);
  const agent = await createAgent(a.workspace.id, "A's shop");
  await openTicket({ agentId: agent.id, subject: "Help", summary: "Help" });
  await settled();
  setTestTenant(b.workspace.id);
  assert.deepEqual(await ticketsForAlerts(a.workspace.id, "2000"), [], "even asking for A's workspace by its id");
});

test("email: everyone who keeps alerts on hears about a customer who needs a person; the others don't", async () => {
  const smtp = await serveSmtp();
  process.env.SMTP_URL = smtp.url;
  process.env.MAIL_FROM = "Keel <alerts@keel.example>";
  try {
    const owner = await signUp({ email: `d${Math.random().toString(36).slice(2)}@example.com`, name: "Dee", password: "long enough" });
    setTestTenant(owner.workspace.id);
    const quiet = await signUp({ email: `e${Math.random().toString(36).slice(2)}@example.com`, name: "Eli", password: "long enough" });
    await db().prepare("INSERT INTO members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)").run(owner.workspace.id, quiet.user.id, new Date().toISOString());
    await setUserSettings(quiet.user.id, { emailAlerts: false });
    const agent = await createAgent(owner.workspace.id, "Harbor Goods");
    const ticket = await openTicket({ agentId: agent.id, subject: "Where is my order?", summary: "Order HG-1043 hasn't arrived after two weeks." });
    await settled();
    assert.equal(smtp.mails.length, 1);
    assert.deepEqual(smtp.mails[0].to, [owner.user.email], "Eli turned email alerts off");
    assert.match(smtp.mails[0].data, /Subject: A customer needs your team: Where is my order\?/);
    assert.match(smtp.mails[0].data, /HG-1043/);
    // Quoted-printable, as email sends it: soft line breaks, and "=" written as "=3D".
    assert.match(smtp.mails[0].data.replace(/=\r?\n/g, "").replace(/=3D/g, "="), new RegExp(`/app/helpdesk\\?t=${ticket.id}`));
  } finally {
    delete process.env.SMTP_URL;
    delete process.env.MAIL_FROM;
    await smtp.close();
  }
});

test("a forgotten password: a link works once, for an hour, and signs the person out everywhere else", async () => {
  const { user } = await signUp({ email: `f${Math.random().toString(36).slice(2)}@example.com`, name: "Fay", password: "old password" });
  const other = await startSession(user.id);
  assert.equal(await startPasswordReset("nobody@example.com"), undefined, "no account, no link (the page answers the same)");
  const reset = (await startPasswordReset(user.email.toUpperCase()))!;
  assert.equal(reset.email, user.email);
  await assert.rejects(() => finishPasswordReset(reset.token, "short"), /at least 8/);
  await finishPasswordReset(reset.token, "a new password");
  await assert.rejects(() => finishPasswordReset(reset.token, "another password"), /used or has expired/, "the link works once");
  assert.equal((await signIn(user.email, "a new password")).id, user.id);
  await assert.rejects(() => signIn(user.email, "old password"), /don't match/);
  assert.equal(await sessionUser(other.token), undefined, "sessions elsewhere are signed out");
  const late = (await startPasswordReset(user.email))!;
  await db().prepare("UPDATE password_resets SET expires_at = ? WHERE user_id = ? AND used_at IS NULL").run("2000-01-01T00:00:00.000Z", user.id);
  await assert.rejects(() => finishPasswordReset(late.token, "yet another one"), /used or has expired/, "and only for an hour");
});
