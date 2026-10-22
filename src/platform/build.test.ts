import { test } from "node:test";
import assert from "node:assert/strict";
import { inkFor, normalUrl, parseQa, qaText } from "@/core/agents";
import { industryDefaults } from "@/core/industries";
import { eventStream } from "@/lib/sse";
import { readEvents } from "@/components/chat/stream";
import { signUp } from "./accounts";
import { agentChange, withChanges } from "./agent-input";
import { converse } from "./chat/converse";
import { queueTraining, settled, siteReads, startSiteRead } from "./knowledge/jobs";
import { addSource, agentSummaries, conversationMessages, createAgent, listSources, updateSourceContent } from "./store";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { serveSite } from "@/testing/site";

// Model calls here: embeddings for training, and a few short replies.
const { skip } = live("build", 40_000);

const workspace = async () => {
  const { workspace: made } = await signUp({ email: `b${Math.random().toString(36).slice(2)}@example.com`, name: "Bo", password: "long enough" });
  setTestTenant(made.id);
  return made;
};

test("an industry gives a new agent its starting role, greeting and suggested questions", async () => {
  const agent = (await createAgent((await workspace()).id, "Northpeak Gym", { industry: "fitness", config: { appearance: { color: "#0e7c66" } } }));
  assert.match(agent.config.instructions, /member assistant for Northpeak Gym/);
  assert.deepEqual(agent.config.appearance.suggestions, industryDefaults("fitness", "x").suggestions);
  assert.match(agent.config.appearance.welcome[0], /Northpeak Gym/);
  assert.equal(agent.config.appearance.color, "#0e7c66", "a chosen colour is kept");
  assert.equal(agent.config.appearance.placeholder, "Write a message…", "and the rest of the look keeps its defaults");
});

test("knowledge trains in the background, and edits are learned again only when the text changed", { skip }, async () => {
  const agent = (await createAgent((await workspace()).id, "Harbor Goods", { industry: "retail" }));
  const source = (await addSource(agent.id, { kind: "text", title: "Hours", content: "We are open from 9am to 6pm, Monday to Saturday." }));
  await queueTraining(source.id);
  await settled();
  assert.equal((await listSources(agent.id))[0].status, "ready");
  assert.equal((await agentSummaries(agent.workspaceId))[0].readySources, 1);

  assert.equal((await updateSourceContent(source.id, { content: "We are open from 9am to 6pm, Monday to Saturday." })), false, "the same text needs no retraining");
  assert.equal((await updateSourceContent(source.id, { content: "We are open from 8am to 8pm, every day of the week." })), true);
  assert.equal((await listSources(agent.id))[0].status, "pending");
  await queueTraining(source.id);
  await settled();
  const answer = await converse({ agent, channel: "playground", message: "What are your opening hours each day?" });
  assert.match(answer.reply.text, /8\s?(am|a\.m\.)[^.]*8\s?(pm|p\.m\.)|8:00[^.]*20:00/i, "the agent answers from the new text");
});

test("reading a website adds each page as a source, and reading it again updates them instead of copying", { skip }, async () => {
  const agent = (await createAgent((await workspace()).id, "Fern Hotel", { industry: "hospitality" }));
  const site = await serveSite({
    "/": { body: `<html><head><title>Fern Hotel</title></head><body><main><p>${"Check-in is from 3pm and check-out is by 11am. ".repeat(6)}</p><a href="/spa">Spa</a></main></body></html>` },
    "/spa": { body: `<html><head><title>Spa</title></head><body><main><p>${"The spa is open daily from 7am to 9pm for hotel guests. ".repeat(6)}</p></main></body></html>` },
  });
  try {
    await startSiteRead(agent.id, `${site.url}/`);
    assert.equal(siteReads(agent.id)[0].status, "reading");
    await settled();
    assert.equal(siteReads(agent.id)[0].status, "done");
    assert.equal(siteReads(agent.id)[0].pages, 2);
    assert.deepEqual((await listSources(agent.id)).map((s) => [s.kind, s.title, s.status]).sort(), [["website", "Fern Hotel", "ready"], ["website", "Spa", "ready"]]);

    await startSiteRead(agent.id, `${site.url}/`);
    await settled();
    assert.equal((await listSources(agent.id)).length, 2, "the same pages aren't added twice");

    await startSiteRead(agent.id, `${site.url}/nothing-here`);
    await settled();
    assert.equal(siteReads(agent.id)[0].status, "failed");
    assert.match(siteReads(agent.id)[0].error ?? "", /doesn.t exist/);
  } finally {
    await site.close();
  }
});

test("a conversation continues with its history and stores each reply with its sources and cost", { skip }, async () => {
  const agent = (await createAgent((await workspace()).id, "Quill Books", { industry: "retail" }));
  const source = (await addSource(agent.id, { kind: "qa", title: "Do you ship abroad?", content: qaText("Do you ship abroad?", "Yes, we ship to 30 countries; delivery takes 7 to 10 days.") }));
  await queueTraining(source.id);
  await settled();

  const pieces: string[] = [];
  let started = "";
  const first = await converse({ agent, channel: "playground", message: "Do you ship abroad?", onText: (p) => pieces.push(p), onStart: (id) => (started = id) });
  assert.equal(started, first.conversationId);
  assert.match(first.reply.text, /30/);
  assert.equal(pieces.join(""), first.reply.text);

  const second = await converse({ agent, channel: "playground", conversationId: first.conversationId, message: "How long does delivery abroad take?" });
  assert.equal(second.conversationId, first.conversationId);
  const stored = (await conversationMessages(first.conversationId));
  assert.deepEqual(stored.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
  assert.equal((stored[1].meta.citations as { title: string }[])[0].title, "Do you ship abroad?");

  const other = await createAgent(agent.workspaceId, "Someone else");
  const elsewhere = await converse({ agent: other, channel: "playground", conversationId: first.conversationId, message: "Hello" });
  assert.notEqual(elsewhere.conversationId, first.conversationId, "a conversation can't be continued by another agent");
});

test("the agent talks like the business, even with strict instructions: never about its sources", { skip }, async () => {
  // Instructions like a real builder's, which once made an agent say "Based strictly on the provided knowledge source".
  const agent = await createAgent((await workspace()).id, "Polar Assist", {
    industry: "professional",
    config: { instructions: "You are a helpful assistant for Polar Assist. You speak in a professional tone, avoiding speculation and sticking strictly to the information provided. If you do not know an answer, say you don't know." },
  });
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Assistance", content: "Polar Assist runs a 24/7 assistance centre for travellers. Members call +44 20 7946 0000 from anywhere in the world." })).id);
  await settled();
  const robotic = /knowledge source|(provided|available) (information|knowledge|context|sources?|resources)|\b(my|our) (resources|documents|sources)\b|\bpassages?\b|based (strictly|solely|only)? ?on (the|my)/i;
  for (const message of ["How do I reach your assistance centre?", "Do you have an office in Lisbon?"]) {
    const turn = await converse({ agent, channel: "playground", message });
    assert.doesNotMatch(turn.reply.text, robotic, `"${message}" got: ${turn.reply.text}`);
  }
});

test("unsaved settings can be tried before saving, and a change is checked first", { skip }, async () => {
  const agent = (await createAgent((await workspace()).id, "Lumen Bank", { industry: "financial" }));
  const preview = withChanges(agent.config, { fallback: "Please call us on 0800 000.", appearance: { displayName: "Lumi" } });
  assert.equal(preview.appearance.displayName, "Lumi");
  assert.equal(preview.appearance.color, agent.config.appearance.color, "the rest of the look is unchanged");
  const answer = await converse({ agent: { ...agent, config: preview }, channel: "playground", message: "Can I get a mortgage on a houseboat?" });
  // (Models sometimes write the space in a phone number as a non-breaking one.)
  assert.match(answer.reply.text, /0800\s000/, "with nothing in its knowledge on it, it says the unsaved \"don't know\" message");

  assert.equal(agentChange.safeParse({ config: { temperature: 2 } }).success, false);
  assert.equal(agentChange.safeParse({ config: { appearance: { color: "red" } } }).success, false);
  assert.equal(agentChange.safeParse({ config: { model: "auto", appearance: { color: "#AABBCC" } } }).success, true);
});

test("a streamed reply arrives in the browser event by event", async () => {
  const response = await eventStream(new Request("http://x"), async (send) => {
    send("start", { conversationId: "conv_1" });
    for (const t of ["Hel", "lo ", "there"]) send("text", { t });
    send("done", { text: "Hello there" });
  });
  const events: [string, unknown][] = [];
  await readEvents(response, (event, data) => events.push([event, data]));
  assert.deepEqual(events.map(([e]) => e), ["start", "text", "text", "text", "done"]);
  assert.equal(events.filter(([e]) => e === "text").map(([, d]) => (d as { t: string }).t).join(""), "Hello there");

  const failing = await eventStream(new Request("http://x"), async () => {
    throw Object.assign(new Error("rate limited"), { status: 429 });
  });
  const errors: unknown[] = [];
  await readEvents(failing, (event, data) => event === "error" && errors.push(data));
  assert.match((errors[0] as { message: string }).message, /very busy/, "failures are explained in plain words");
});

test("small helpers: web addresses, Q&A text, readable colours", async () => {
  assert.equal(normalUrl("example.com"), "https://example.com/");
  assert.equal(normalUrl("http://shop.example/faq#top"), "http://shop.example/faq");
  assert.equal(normalUrl("ftp://example.com"), undefined);
  assert.equal(normalUrl("not a site"), undefined);
  assert.deepEqual(parseQa(qaText(" Open on Sundays? ", "No.\nWe rest.")), { question: "Open on Sundays?", answer: "No.\nWe rest." });
  assert.equal(inkFor("#2348d8"), "#ffffff");
  assert.equal(inkFor("#f5d90a"), "#15171c");
});
