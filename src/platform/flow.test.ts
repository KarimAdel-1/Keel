import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { PROCEDURE_TEMPLATES, actionsIn } from "@/core/procedures";
import { renderWidget } from "@/core/widgets";
import { db } from "@/lib/db";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { serveSite } from "@/testing/site";
import { signUp } from "./accounts";
import { createAction, runAction, toolsFor, updateAction } from "./actions";
import { allowMessage, domainAllowed } from "./chat/limits";
import { converse, PAUSED_MESSAGE } from "./chat/converse";
import { csvCell, listContacts, parseCsv } from "./contacts";
import { getTicket, hasOpenTicket, listTickets, replyAsTeam, setStatus } from "./helpdesk";
import { queueTraining, settled } from "./knowledge/jobs";
import { saveProcedure } from "./procedures";
import { businessInformation } from "./knowledge/information";
import { addSource, conversationMessages, conversationSummary, createAgent, getAgent, replaceChunks, startConversation, updateAgent } from "./store";
import { addSubmission } from "./submissions";
import { findGaps, listSuggestions } from "./suggestions";
import { customerMessage, generateTests, getRun, listRuns, runTests, saveTest } from "./tests";
import { agentTokens } from "./usage";
import { createWebhook, dispatchWebhook, signature, webhooksSent } from "./webhooks";
import { saveWidget } from "./widgets";

// Model calls here: a handful of customer turns, two test runs judged, a small crowd written, a spam check.
const { skip } = live("flow", 90_000);

const account = async () => {
  const made = await signUp({ email: `f${Math.random().toString(36).slice(2)}@example.com`, name: "Sam Rivera", password: "long enough" });
  setTestTenant(made.workspace.id);
  return made;
};

/** An agent that knows a shop's returns and shipping (trained with real embeddings). */
async function shop() {
  const { user, workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Returns", content: "You can return any item within 30 days of delivery for a full refund. Returns are free in the UK." })).id);
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Shipping", content: "Orders ship within 2 working days. UK delivery takes 3 to 5 working days and costs £4, free over £50." })).id);
  await settled();
  return { user, workspace, agent };
}

test("handover: the agent brings in a person, goes quiet, and the team's reply reaches the customer's chat", { skip }, async () => {
  const { user, workspace, agent } = await shop();
  await createAction(agent.id, "handoff");

  const first = await converse({ agent, channel: "widget", message: "I want to talk to a real person from your team, please." });
  assert.equal(first.reply.actions[0]?.name, "hand_over_to_person");
  assert.equal(first.reply.handedOver, true);
  assert.equal((await conversationSummary(first.conversationId))?.status, "handed_off");
  const [ticket] = await listTickets(workspace.id, "all", user.id);
  assert.equal(ticket.conversationId, first.conversationId, "a ticket opens for the conversation");

  const waiting = await converse({ agent, channel: "widget", conversationId: first.conversationId, message: "Hello? Anyone there?" });
  assert.equal(waiting.status, "with_team", "while the team has it, the agent stays quiet");
  const before = (await conversationMessages(first.conversationId)).filter((m) => m.role === "assistant").length;

  await replyAsTeam(ticket.id, "Hi, Sam here from the team. How can I help?", user);
  const messages = (await conversationMessages(first.conversationId));
  assert.equal(messages.at(-1)?.role, "human");
  assert.equal(messages.at(-1)?.meta.author, "Sam Rivera");
  assert.equal((await getTicket(ticket.id))?.status, "waiting", "after the team replies, it's on the customer");

  await converse({ agent, channel: "widget", conversationId: first.conversationId, message: "My mug arrived broken." });
  assert.equal((await getTicket(ticket.id))?.status, "open", "the customer writing again puts it back on the team");
  assert.equal((await conversationMessages(first.conversationId)).filter((m) => m.role === "assistant").length, before, "and the agent still doesn't answer");

  await setStatus(ticket.id, "solved", user.id);
  assert.equal((await conversationSummary(first.conversationId))?.status, "open", "solving the ticket gives the conversation back to the agent");
});

test("tickets: the chat listens while a ticket is open, and the team's first reply makes it a live chat", async () => {
  const { user, workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  const conversationId = (await startConversation(agent.id, "widget"));
  assert.equal((await hasOpenTicket(conversationId)), false);

  await runAction((await createAction(agent.id, "escalate")), JSON.stringify({ summary: "Mug arrived broken." }), { agent, conversationId });
  assert.equal((await hasOpenTicket(conversationId)), true, "the chat now listens for the team");
  assert.equal((await conversationSummary(conversationId))?.status, "open", "the agent keeps answering until someone replies");

  const [ticket] = await listTickets(workspace.id, "all", user.id);
  await replyAsTeam(ticket.id, "Hi, Sam here. Sorry about the mug.", user);
  assert.equal((await conversationSummary(conversationId))?.status, "handed_off", "the reply hands the chat to the team");

  await setStatus(ticket.id, "solved", user.id);
  assert.equal((await hasOpenTicket(conversationId)), false);
});

test("actions: an API call fills its URL, and its response is drawn as a widget", async () => {
  const { workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  // The business's order API, served for real.
  const api = await serveSite({
    "/orders/HG-1043": { body: JSON.stringify({ order: "HG-1043", stages: ["Ordered", "Packed", "Shipped", "Delivered"], status: "Shipped" }), type: "application/json" },
    "/orders/HG-1": { status: 500, body: "nope", type: "text/plain" },
  });
  try {
    const widget = (await saveWidget(agent.id, { template: "tracker", name: "Order tracker", mapping: { title: "order", steps: "stages", current: "status" }, sample: "" }));
    const action = (await createAction(agent.id, "api", { config: { url: `${api.url}/orders/{order_number}`, widgetId: widget.id } }));
    const outcome = await runAction(action, JSON.stringify({ order_number: "HG-1043" }), { agent });
    assert.ok(api.asked.includes("/orders/HG-1043"), "the URL is filled from the arguments");
    assert.deepEqual("widget" in outcome && outcome.widget, { type: "tracker", title: "HG-1043", steps: ["Ordered", "Packed", "Shipped", "Delivered"], current: 2 });

    const failed = await runAction(action, JSON.stringify({ order_number: "HG-1" }), { agent });
    assert.equal("error" in failed && failed.error, "HTTP 500", "an error from the system is reported, not hidden");
  } finally {
    await api.close();
  }
  assert.deepEqual(renderWidget({ template: "cards", mapping: { items: "items", title: "name", image: "img" } }, { items: [{ name: "Mug", img: "javascript:alert(1)" }] }), { type: "cards", items: [{ title: "Mug" }] }, "only https pictures are shown");
});

test("tests: an AI customer talks to the agent, and a run fails when an expected action isn't used", { skip }, async () => {
  const { agent } = await shop();
  await createAction(agent.id, "escalate");
  const good = (await saveTest(agent.id, { name: "Returns", persona: "A polite customer who wants to know how long they have to return an item, and whether returns cost anything.", criterion: "The assistant explains the 30-day returns window and that returns are free in the UK.", maxTurns: 3 }));
  const strict = (await saveTest(agent.id, { name: "Needs a ticket", persona: "A customer who wants to know about returns.", criterion: "The assistant explains returns.", expectedActions: ["create_ticket"], actionResponses: { create_ticket: { ticket: "T-1" } }, maxTurns: 2 }));

  await runTests(agent.id, [good.id, strict.id], 1);
  await settled();
  const runs = (await listRuns(agent.id));
  assert.equal(runs.length, 2, "each test runs as many times as asked");
  const passed = runs.find((r) => r.testId === good.id)!;
  assert.equal(passed.status, "passed", `an agent that answers from its knowledge passes (judge: ${passed.verdict?.reasons.join(" ")})`);
  assert.ok(passed.transcript.some((t) => t.role === "customer") && passed.transcript.some((t) => t.role === "agent"));
  const failed = (await getRun(runs.find((r) => r.testId === strict.id)!.id))!;
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.verdict?.missingActions, ["create_ticket"]);

  const crowd = await generateTests(agent, 2);
  assert.equal(crowd.length, 2);
  assert.ok(crowd.every((t) => t.origin === "generated" && t.persona && t.criterion));
});

test("procedures: a template names every action its steps use, and an action kept for procedures stays out of other answers", async () => {
  const { workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  const template = PROCEDURE_TEMPLATES.find((t) => t.name === "Where is my order")!;
  assert.deepEqual(actionsIn(template.steps).sort(), template.needs.map((n) => n.name).sort(), "a template names every action its steps use");
  const lookup = (await createAction(agent.id, "api", { name: "look_up_order", config: { url: "https://shop.example/orders/{order_number}" } }));
  await updateAction(lookup.id, { proceduresOnly: true });
  assert.equal((await toolsFor(agent.id)).tools.length, 0, "outside a procedure, the agent can't use it");
  assert.equal((await toolsFor(agent.id, "1. Use @look_up_order with the order number.")).tools.length, 1, "inside one that calls it, it can");
});

test("procedures: the procedure that fits the message is followed", { skip }, async () => {
  const { agent } = await shop();
  const template = PROCEDURE_TEMPLATES.find((t) => t.name === "Where is my order")!;
  const lookup = (await createAction(agent.id, "api", { name: "look_up_order", config: { url: "https://shop.example/orders/{order_number}" } }));
  await updateAction(lookup.id, { proceduresOnly: true });
  await saveProcedure(agent.id, { name: template.name, trigger: template.trigger, steps: template.steps });
  const answer = await converse({ agent, channel: "playground", message: "Where is my order HG-1043? When will it arrive?", test: { responses: { look_up_order: { status: "Shipped" } } } });
  assert.equal(answer.reply.procedure?.name, "Where is my order", "the procedure that fits the message is followed");
});

test("leads and webhooks: a lead becomes a contact, and the webhook is signed with the secret", async () => {
  const { workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  // The business's webhook receiver, listening for real.
  const sent: { body: string; signature: string | undefined }[] = [];
  const receiver = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      sent.push({ body, signature: req.headers["x-keel-signature"] as string | undefined });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  process.env.ALLOW_PRIVATE_NETWORK = "1";
  try {
    const { secret } = await createWebhook(agent.id, `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/keel`, ["lead.collected"]);
    await dispatchWebhook(agent.id, "lead.collected", { name: "Ada" });
    await dispatchWebhook(agent.id, "ticket.created", { id: "t" });
    await webhooksSent();
    assert.equal(sent.length, 1, "only the events it asked for");
    assert.equal(sent[0].signature, `sha256=${createHmac("sha256", secret).update(sent[0].body).digest("hex")}`);
    assert.equal(signature(secret, sent[0].body), sent[0].signature);
  } finally {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }

  // A lead with an email becomes a contact.
  const other = (await createAgent(workspace.id, "Second agent", { industry: "retail" }));
  await addSubmission({ agentId: other.id, kind: "lead", data: { name: "Ada Lovelace", email: "ada@example.com" } });
  await addSubmission({ agentId: other.id, kind: "lead", data: { name: "Ada L.", email: "ada@example.com" } });
  const { contacts } = await listContacts(workspace.id, { search: "ada" });
  assert.equal(contacts.length, 1, "the same email is one contact");

  assert.equal(csvCell("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"", "a cell that looks like a formula can't run in a spreadsheet");
  assert.deepEqual(parseCsv('name,email\n"Lee, Jo",jo@example.com\n'), [["name", "email"], ["Lee, Jo", "jo@example.com"]]);
});

test("suggestions: a question the agent couldn't answer becomes something to fix", { skip }, async () => {
  const { agent } = await shop();
  await converse({ agent, channel: "widget", message: "Do you sell gift cards for birthdays?" });
  await converse({ agent, channel: "widget", message: "Can I buy a gift card?" });
  assert.ok((await findGaps(agent.id)) >= 1);
  const gap = (await listSuggestions(agent.id)).find((s) => s.kind === "gap");
  assert.ok(gap && gap.detail.questions?.some((q) => /gift card/i.test(q)), "the questions asked are kept with it");
});

test("limits: message limits per visitor, and the websites allowed to show the chat", async () => {
  const { workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods"));
  const limit = { messages: 2, seconds: 60 };
  assert.ok(allowMessage(agent.id, "v1", limit).ok);
  assert.ok(allowMessage(agent.id, "v1", limit).ok);
  assert.equal(allowMessage(agent.id, "v1", limit).ok, false, "the third message in the window is refused");
  assert.ok(allowMessage(agent.id, "v2", limit).ok, "another visitor isn't affected");

  assert.ok(domainAllowed([], "anything.example"), "no list allows every website");
  assert.ok(domainAllowed(["*.harbor.example"], "shop.harbor.example"));
  assert.ok(domainAllowed(["harbor.example"], "harbor.example"));
  assert.equal(domainAllowed(["harbor.example"], "evil.example"), false);
});

test("spam pauses the chat, and every model call is metered", { skip }, async () => {
  const { agent } = await shop();
  const guarded = (await updateAgent(agent.id, { config: { protection: { spam: { enabled: true, definition: "Gibberish, insults or adverts are spam." } } } }))!;
  const advert = "Cheap watches at cheap-watches.example, buy now!";
  const one = await converse({ agent: guarded, channel: "widget", message: advert });
  assert.notEqual(one.status, "paused", "one message isn't checked yet");
  const two = await converse({ agent: guarded, channel: "widget", conversationId: one.conversationId, message: advert });
  assert.equal(two.status, "paused");
  assert.equal(two.reply.text, PAUSED_MESSAGE);

  // Every model call in a turn is metered for the agent, in tokens, by task.
  const before = (await agentTokens(agent.id));
  const metered = await converse({ agent: (await getAgent(agent.id))!, channel: "widget", message: "What does UK delivery cost?" });
  assert.equal(metered.status, "answered");
  assert.ok((await agentTokens(agent.id)) > before, "the turn's tokens are counted");
  const tasks = (await db().prepare("SELECT DISTINCT task FROM usage_events WHERE agent_id = ? AND kind = 'reply'").all(agent.id)) as { task: string }[];
  assert.ok(tasks.some((t) => t.task === "reply" || t.task === "agent step"), "by what each call was for");
  const stored = (await conversationMessages(metered.conversationId)).at(-1)!;
  assert.ok(Number(stored.meta.tokens) > 0, "and each reply keeps what it used");
});

test("tests: the AI customer's end marker is read however it's written, and only at the end", async () => {
  assert.deepEqual(customerMessage("FINISHED"), { message: "", done: true });
  assert.deepEqual(customerMessage("Thanks, that's all I needed! FINISHED."), { message: "Thanks, that's all I needed!", done: true });
  assert.deepEqual(customerMessage("**FINISHED**"), { message: "", done: true });
  assert.deepEqual(customerMessage("Is the FINISHED glaze dishwasher safe?"), { message: "Is the FINISHED glaze dishwasher safe?", done: false });
  assert.deepEqual(customerMessage("Can I return my mug?"), { message: "Can I return my mug?", done: false });
});

test("judges and the test writer read the business's information: whole when it fits, a share of every source when it doesn't", async () => {
  const { workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail", config: { profile: { summary: "A small shop for handmade stoneware." } } }));
  const returns = (await addSource(agent.id, { kind: "text", title: "Returns", content: "placeholder" }));
  await replaceChunks(returns.id, [{ text: "You can return any unused item within 30 days of delivery for a full refund." }, { text: "Personalised and sale items can't be returned unless they arrive damaged." }]);
  const shipping = (await addSource(agent.id, { kind: "text", title: "Shipping", content: "placeholder" }));
  await replaceChunks(shipping.id, [{ text: "Express delivery is next working day if ordered before 1pm and costs £9.95." }, { text: "Standard UK delivery takes 3 to 5 working days." }]);

  const whole = await businessInformation(agent, 16_000);
  assert.match(whole, /A small shop for handmade stoneware/, "the profile the agent is told about");
  for (const fact of ["30 days", "sale items", "£9.95", "3 to 5 working days"]) assert.ok(whole.includes(fact), `every fact, word for word: ${fact}`);
  assert.doesNotMatch(whole, /Part of what/, "nothing is left out, so nothing says it is");

  const tight = await businessInformation(agent, 260);
  assert.ok(tight.includes("### Returns") && tight.includes("### Shipping"), `past the budget, every source keeps a share:\n${tight}`);
  assert.match(tight, /Part of what Harbor Goods knows/);
});
