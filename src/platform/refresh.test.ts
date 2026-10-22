import { test } from "node:test";
import assert from "node:assert/strict";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { applyProposal, backstageMessages } from "./backstage";
import { settled } from "./knowledge/jobs";
import { post, refreshAfterDocuments } from "./knowledge/refresh";
import { addSource, createAgent, getAgent, updateAgent } from "./store";

// Model calls here: one profile refresh (Nemotron 3 Super).
const { skip } = live("refresh", 60_000);

const FIX = "When stating numbers, keep any qualifier such as '+'.";

/** An agent that's set up, with a fix the improvement agent added to its role and a rule. */
async function shop() {
  const { workspace } = await signUp({ email: `r${Math.random().toString(36).slice(2)}@example.com`, name: "Rae", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  await updateAgent(agent.id, {
    config: {
      instructions: `You are the assistant for Harbor Goods, a homeware shop.\n\n${FIX}`,
      guardrails: "Never promise a refund.",
      profile: { summary: "Harbor Goods sells homeware online.", offerings: ["Mugs", "Plates"], audience: "Home cooks in the UK.", tone: "Warm" },
    },
  });
  return (await getAgent(agent.id))!;
}

const refresh = { unrelated: false, changed: true, why: "It adds a gift-wrapping service.", summary: "Harbor Goods sells homeware online and wraps gifts.", offerings: ["Mugs", "Plates", "Gift wrapping"], audience: "Home cooks in the UK.", tone: "Warm", welcome: "Hi! Looking for a mug or a gift?", suggestions: ["Do you wrap gifts?"], roleAddition: "You also help customers with gift wrapping." };

test("new documents: the profile is updated and the role only added to, so fixes and rules stay word for word", async () => {
  const agent = (await shop());
  await post(agent.id, ["Gift wrapping.pdf"], refresh);
  const [message] = await backstageMessages(agent.id);
  assert.deepEqual(message.proposals.map((p) => p.kind), ["profile", "instructions_add"]);

  for (const i of [0, 1]) assert.equal((await applyProposal((await getAgent(agent.id))!, message.id, i)).ok, true);
  const after = (await getAgent(agent.id))!.config;
  assert.ok(after.instructions.startsWith(agent.config.instructions), "the role is kept as it was, fix included");
  assert.ok(after.instructions.endsWith("You also help customers with gift wrapping."));
  assert.equal(after.guardrails, "Never promise a refund.", "rules aren't touched");
  assert.deepEqual(after.profile.offerings, ["Mugs", "Plates", "Gift wrapping"]);
  assert.equal(after.appearance.welcome[0], "Hi! Looking for a mug or a gift?");
  assert.deepEqual(after.appearance.suggestions, ["Do you wrap gifts?"]);
});

test("new documents: one about something else changes nothing, and one that adds nothing says so", async () => {
  const agent = (await shop());
  await post(agent.id, ["Property report.pdf"], { ...refresh, unrelated: true, why: "It's a real-estate app's QA report." });
  await post(agent.id, ["Mugs.pdf"], { ...refresh, changed: false, roleAddition: FIX });
  const [unrelated, nothing] = await backstageMessages(agent.id);
  assert.equal(unrelated.proposals.length, 0);
  assert.match(unrelated.content, /doesn't look like it's about Harbor Goods/);
  assert.equal(nothing.proposals.length, 0, "an addition the role already has isn't proposed again");
  assert.match(nothing.content, /nothing in the profile or the role needs to change/);
});

test("new documents: an agent still being set up isn't refreshed (the Learn step drafts its first profile)", async () => {
  const { workspace } = await signUp({ email: `r${Math.random().toString(36).slice(2)}@example.com`, name: "Rae", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = (await createAgent(workspace.id, "New Shop", { industry: "retail" }));
  const source = (await addSource(agent.id, { kind: "file", title: "Prices.pdf", content: "Mugs cost £8." }));
  assert.equal((await refreshAfterDocuments(agent.id, [source.id])), false);
});

test("new documents: Keel reads them and proposes the update in Backstage", { skip }, async () => {
  const agent = (await shop());
  const source = (await addSource(agent.id, { kind: "file", title: "Gift wrapping.pdf", content: "Gift wrapping at Harbor Goods: add gift wrapping to any order for £3. We wrap in recycled paper and add a handwritten card. Choose it at checkout." }));
  assert.equal((await refreshAfterDocuments(agent.id, [source.id])), true);
  await settled();
  const [message] = await backstageMessages(agent.id);
  assert.ok(message, "a message arrives in Backstage");
  const profile = message.proposals.find((p) => p.kind === "profile");
  assert.ok(profile, `it proposes a profile update (${message.content})`);
  assert.match(profile.value, /wrap/i, "that mentions what the document adds");
  assert.equal((await getAgent(agent.id))!.config.instructions, agent.config.instructions, "nothing changes until the builder applies it");
});
