import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatches, numbersNotIn, ungroundedClaim, type AgentSnapshot, type Patch } from "@/core/patches";
import { db } from "@/lib/db";
import { newId, now } from "@/lib/rows";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { createAction, listActions, updateAction } from "./actions";
import { CAUSE_TEXT, DEPTHS, applyImprovement, discardImprovement, getImprovement, isFixed, ruledOut, startCheck, startImprovement } from "./improve";
import { fixKey, forgetLessons, lessonsAboutFix, memoryOf, memoryStore, notesOf, recentLessons, remember, rememberDecision, rememberNote } from "./memory";
import { queueTraining, settled } from "./knowledge/jobs";
import { addSource, createAgent, getAgent, listSources } from "./store";
import { listRuns, saveTest } from "./tests";
import { agentFingerprint, listVersions, restoreVersion, saveVersion, snapshotOf } from "./versions";

// Model calls here: one quick improvement session and one check of an unsaved change, on small agents.
const { skip } = live("improve", 220_000);

const account = async () => {
  const made = await signUp({ email: `i${Math.random().toString(36).slice(2)}@example.com`, name: "Ivy", password: "long enough" });
  setTestTenant(made.workspace.id);
  return made;
};

/** An agent that knows a shop's returns policy (trained with real embeddings). */
async function shop() {
  const { user, workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Returns", content: "You can return any item within 30 days of delivery for a full refund. Returns are free in the UK. If an item arrives broken, we replace it for free." })).id);
  await settled();
  return { user, agent };
}

test("edits are exact: a passage that isn't there, or is there twice, is refused, and nothing else changes", async () => {
  const base = { name: "A", config: { instructions: "Be kind. Be brief.", guardrails: "Never promise refunds.", fallback: "I'm not sure.", model: "super" }, actions: [], procedures: [] } as unknown as AgentSnapshot;
  const result = applyPatches(base, [
    { kind: "instructions_replace", why: "", find: "Be brief.", replace: "Be brief, and give the order number back." },
    { kind: "rules_replace", why: "", find: "Never promise anything.", replace: "x" },
    { kind: "instructions_add", why: "", text: "Be kind." },
    { kind: "action_when", why: "", action: "missing_action", description: "x" },
    { kind: "model_set", why: "", model: "ultra" },
  ]);
  assert.equal(result.snapshot.config.instructions, "Be kind. Be brief, and give the order number back.");
  assert.equal(result.snapshot.config.guardrails, "Never promise refunds.");
  assert.equal(result.snapshot.config.model, "ultra");
  assert.deepEqual(result.rejected.map((r) => r.patch.kind), ["rules_replace", "instructions_add", "action_when"]);
  assert.equal(base.config.instructions, "Be kind. Be brief.", "the original is untouched");

  // A procedure's steps may give the business's email address: it isn't a call to an action called @harbor.
  const withActions = { ...base, actions: [{ name: "create_ticket" }], procedures: [{ name: "Return or refund", steps: "1. Answer." }] } as unknown as AgentSnapshot;
  const steps = applyPatches(withActions, [
    { kind: "procedure_steps", why: "", procedure: "Return or refund", steps: "1. If it arrived broken, ask them to email hello@harbor.example.\n2. Use @create_ticket." },
    { kind: "procedure_steps", why: "", procedure: "Return or refund", steps: "1. Use @refund_now." },
  ]);
  assert.match(steps.snapshot.procedures[0].steps, /hello@harbor\.example/);
  assert.deepEqual(steps.rejected.map((r) => r.reason), ["the steps call actions that don't exist: @refund_now"]);
});

test("a test counts as fixed when it passes clearly more often: from failing, or from failing now and then to always passing", () => {
  assert.ok(isFixed(0, 2 / 3) && isFixed(1 / 3, 1) && isFixed(0.5, 1));
  assert.ok(isFixed(2 / 3, 1), "2 of 3 to 3 of 3: a test that failed a third of the time is a target, so it can be fixed");
  assert.ok(!isFixed(0, 1 / 3) && !isFixed(2 / 3, 2 / 3) && !isFixed(0.8, 0.9));
});

test("a new Q&A must quote the knowledge and can't change its numbers", async () => {
  const knowledge = "You can return any item within 30 days of delivery for a full refund.";
  assert.equal(ungroundedClaim("return any item within 30 days of delivery", knowledge), undefined);
  assert.ok(ungroundedClaim("return any item within 60 days", knowledge));
  assert.deepEqual(numbersNotIn("Returns are accepted for 60 days.", "within 30 days of delivery"), ["60"]);
});

test("the improvement agent finds why a test fails, tries fixes on a copy, remembers what it learned, and a proven fix can be applied and undone", { skip }, async () => {
  const { user, agent } = await shop();
  // The ticket action, described for the wrong purpose, so the agent doesn't use it for a broken item (measured on the
  // real model; a description that only forbids it is, rightly, treated as the builder's intent): the improvement
  // agent has to find and fix why.
  const ticket = (await createAction(agent.id, "escalate"));
  await updateAction(ticket.id, { description: "Records the customer's feedback about how our website looks." });
  await saveVersion(agent.id, { label: "Created", origin: "created" });
  const broken = (await saveTest(agent.id, {
    name: "Broken mug",
    persona: "A customer whose stoneware mug arrived broken and wants the team to replace it.",
    criterion: "The assistant opens a ticket so the team can replace the broken mug.",
    expectedActions: ["create_ticket"],
    actionResponses: { create_ticket: { ticket: "T-1", tell_the_customer: "I've opened a ticket; the team will send a replacement." } },
    maxTurns: 2,
  }));
  await saveTest(agent.id, { name: "Returns", persona: "A polite customer who wants to know how many days they have to return an item.", criterion: "The assistant says items can be returned within 30 days of delivery.", maxTurns: 2 });

  const started = (await startImprovement(agent.id, { depth: "quick", authorId: user.id }));
  assert.ok(!("error" in started));
  await settled();
  const session = (await getImprovement(started.id))!;
  console.log(`  improvement: ${session.state.outcome}; ${session.state.candidates.map((c) => `${c.status}${c.confirmed ? " (confirmed)" : ""}: ${c.hypothesis}`).join(" | ")}`);
  assert.equal(session.status, "done", session.state.error);
  assert.ok(["improved", "no_improvement", "needs_you"].includes(session.state.outcome!), `a real outcome, not ${session.state.outcome}`);
  assert.ok(session.state.targets.includes(broken.id), "the failing test is a target");
  assert.ok(session.state.diagnoses.some((d) => d.testId === broken.id && d.cause in CAUSE_TEXT), "its cause is diagnosed");
  assert.equal((await listRuns(agent.id)).length, 0, "trial runs stay out of the agent's own test results");

  // What it learned is in the agent's memory: the cause, and every fix it tried.
  const lessons = (await recentLessons(agent.id, 50));
  assert.ok(lessons.some((l) => l.kind === "cause" && l.tests.includes(broken.id)), "why the test failed");
  for (const c of session.state.candidates.filter((x) => x.status === "done")) {
    assert.ok(lessons.some((l) => l.fix === c.fix && (l.kind === "kept" || l.kind === "rejected")), `what happened to "${c.hypothesis}"`);
  }

  if (session.state.outcome === "improved") {
    const best = session.state.best!;
    const baseline = session.state.baseline!.tests.find((t) => t.testId === broken.id)!;
    const after = best.measurement.tests.find((t) => t.testId === broken.id);
    assert.ok(after && after.passes / after.runs > baseline.passes / baseline.runs, "proven: the failing test passes more often");
    // The fix may be any kind of edit (a clearer action, a procedure, instructions…): the agent itself changes.
    const before = (await agentFingerprint(agent.id));
    assert.ok((await applyImprovement(session.id, user.id)).ok);
    assert.notEqual((await agentFingerprint(agent.id)), before, "applied to the live agent");
    assert.ok((await recentLessons(agent.id, 50)).some((l) => l.kind === "applied"), "and the decision is remembered");
    const created = (await listVersions(agent.id)).find((v) => v.label === "Created")!;
    assert.ok((await restoreVersion(agent.id, created.id, user.id)).ok);
    assert.equal((await agentFingerprint(agent.id)), before, "and undone exactly");
  }
});

test("checking an unsaved change shows what it would fix and break before it's saved", { skip }, async () => {
  const { agent } = await shop();
  await saveTest(agent.id, { name: "Returns", persona: "A polite customer who asks how many days they have to return an item.", criterion: "The assistant says items can be returned within 30 days of delivery.", maxTurns: 2 });
  const started = (await startCheck(agent.id, { fallback: "I'm not sure about that. Let me connect you with someone from the team." }));
  assert.ok(!("error" in started));
  await settled();
  const session = (await getImprovement(started.id))!;
  assert.equal(session.state.outcome, "checked", session.state.error);
  assert.ok(session.state.check && session.state.check.saved.runs > 0 && session.state.check.draft.runs > 0, "both versions were measured");
  assert.equal((await getAgent(agent.id))!.config.fallback, agent.config.fallback, "checking never saves the change");
});

test("versions keep each state once, restore exactly, and remove the Q&As improvements added since", async () => {
  const { user, agent } = await shop();
  const first = (await saveVersion(agent.id, { label: "Start", origin: "created" }))!;
  assert.equal((await saveVersion(agent.id, { label: "Same again", origin: "change" })), undefined, "an unchanged agent isn't saved twice");
  const action = (await createAction(agent.id, "api", { config: { url: "https://shop.example/orders/{order_number}", headers: [{ name: "Authorization", value: "Bearer secret-token" }] } }));
  const qa = (await addSource(agent.id, { kind: "qa", title: "Gift wrap?", content: "Q: Gift wrap?\nA: Yes, for £3." }));
  await saveVersion(agent.id, { label: "Improvement", origin: "improvement", addedQas: [{ sourceId: qa.id, question: "Gift wrap?", answer: "Yes, for £3." }] });
  assert.equal(((await snapshotOf(agent.id))!.actions[0].config as { headers: { value: string }[] }).headers[0].value, "Bearer secret-token");

  await restoreVersion(agent.id, first.id, user.id);
  assert.equal((await listActions(agent.id)).length, 0, "the action added later is gone");
  assert.ok(!(await listSources(agent.id)).some((s) => s.id === qa.id), "and the improvement's Q&A");
  const [restored, undo] = await listVersions(agent.id);
  assert.match(restored.label, /^Restored "Start"/);
  await restoreVersion(agent.id, undo.id, user.id);
  const back = (await listActions(agent.id));
  assert.equal(back[0]?.id, action.id, "a restore can itself be undone, with the same action");
  assert.equal((back[0].config as { headers: { value: string }[] }).headers[0].value, "Bearer secret-token", "its secret survives, sealed in between");
  assert.ok((await listSources(agent.id)).some((s) => s.kind === "qa" && s.title === "Gift wrap?"), "and the improvement's Q&A comes back");
});

test("Keel's memory works as a LangGraph store: put, get, search by field and by words, namespaces, delete", async () => {
  const store = memoryStore();
  await store.put(["agent", "agt_store", "lessons"], "a", { kind: "rejected", text: "Changing the refund rules broke the returns test." });
  await store.put(["agent", "agt_store", "lessons"], "b", { kind: "kept", text: "Saying when to open a ticket fixed the broken mug test." });
  await store.put(["agent", "agt_store", "notes"], "c", { kind: "note", text: "Prefers short answers." });
  assert.equal((await store.get(["agent", "agt_store", "lessons"], "b"))?.value.kind, "kept");
  assert.equal((await store.search(["agent", "agt_store", "lessons"], { filter: { kind: "rejected" } })).length, 1, "by field");
  assert.equal((await store.search(["agent", "agt_store", "lessons"], { query: "broken mug ticket" }))[0].key, "b", "by words, best first");
  assert.equal((await store.search(["agent", "agt_store"])).length, 3, "a namespace prefix finds everything under it");
  assert.deepEqual(await store.listNamespaces({ prefix: ["agent", "agt_store"] }), [["agent", "agt_store", "lessons"], ["agent", "agt_store", "notes"]]);
  await store.delete(["agent", "agt_store", "lessons"], "a");
  assert.equal(await store.get(["agent", "agt_store", "lessons"], "a"), null);
});

test("memory rules out a fix the builder turned down, or one that already failed on the agent as it is", async () => {
  const store = memoryStore();
  const agentId = "agt_rules";
  const patches: Patch[] = [{ kind: "action_when", why: "x", action: "create_ticket", description: "Use it when an item arrives broken." }];
  const fix = fixKey(patches);
  assert.equal(fixKey([{ ...patches[0], why: "another reason" } as Patch]), fix, "the same edits are the same fix, whatever reason is given");
  assert.equal(await ruledOut(store, agentId, fix, "state-1"), undefined, "a fix never tried is tried");

  await remember(store, agentId, `fix:${fix}`, { kind: "rejected", text: "Didn't fix enough.", tests: ["t1"], fix, agentState: "state-1" });
  assert.match((await ruledOut(store, agentId, fix, "state-1")) ?? "", /already failed on this agent as it is now/);
  assert.equal(await ruledOut(store, agentId, fix, "state-2"), undefined, "once the agent changed, it may be worth trying again");

  await remember(store, agentId, `fix:${fix}`, { kind: "kept", text: "Worked.", tests: ["t1"], fix, agentState: "state-2" });
  assert.equal((await lessonsAboutFix(store, agentId, fix)).length, 1, "one lesson per fix: the newest replaces the last");
  assert.equal(await ruledOut(store, agentId, fix, "state-1"), undefined, "a fix that worked isn't ruled out");

  await rememberDecision(agentId, "imp_x:decision:1:0", { kind: "discarded", text: "You discarded it.", tests: ["t1"], fix });
  assert.match((await ruledOut(store, agentId, fix, "state-3")) ?? "", /turned this fix down/, "the builder's no holds whatever the agent's state");
  await forgetLessons(agentId);
  assert.equal(await ruledOut(store, agentId, fix, "state-3"), undefined, "until its memory is forgotten");
});

test("the builder's preferences are shared memory: one note per subject, read by every agent that fixes or advises", async () => {
  const store = memoryStore();
  const agentId = "agt_notes";
  await rememberNote(store, agentId, "Tone", "Never change the agent's friendly tone.");
  await rememberNote(store, agentId, "fixes", "Prefer adding Q&As over rewriting instructions.");
  await rememberNote(store, agentId, "tone", "Keep the tone friendly but shorter.");
  const notes = (await notesOf(agentId));
  assert.equal(notes.length, 2, "a newer note on the same subject replaces the old one");
  assert.ok(notes.some((n) => n.text === "Keep the tone friendly but shorter."));
  assert.ok(!notes.some((n) => /Never change/.test(n.text)));
  assert.equal((await memoryOf(agentId)).filter((m) => m.kind === "note").length, 2, "the Memory page shows them with the lessons");
});

/** A finished session that proved one fix, as the improvement agent leaves it. */
async function provenSession(agentId: string, testId: string, patches: Patch[]): Promise<string> {
  const id = newId("imp");
  const fix = fixKey(patches);
  const state = {
    settings: DEPTHS.quick,
    targets: [testId],
    regressions: [],
    diagnoses: [],
    candidates: [{ round: 1, index: 0, hypothesis: "Say when to open a ticket", patches, rejected: [], status: "done", fixed: [testId], broke: [], accepted: true, confirmed: true, fix }],
    needsYou: [],
    addedTests: 0,
    progress: { done: 0, total: 0 },
    outcome: "improved",
    best: { patches, measurement: { tests: [], passes: 0, runs: 0 }, fixed: [testId] },
  };
  await db()
    .prepare("INSERT INTO improvements (id, agent_id, kind, status, stage, settings, state, created_at, finished_at) VALUES (?, ?, 'improve', 'done', 'Found a proven improvement', ?, ?, ?, ?)")
    .run(id, agentId, JSON.stringify(DEPTHS.quick), JSON.stringify(state), now(), now());
  return id;
}

test("the builder's decisions about fixes are remembered: discarded, applied, and undone by restoring a version", async () => {
  const { user, workspace } = await account();
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  const ticket = (await createAction(agent.id, "escalate"));
  const patches: Patch[] = [{ kind: "action_when", why: "x", action: ticket.name, description: "Use it when an item arrives broken." }];
  const fix = fixKey(patches);

  await discardImprovement(await provenSession(agent.id, "tst_mug", patches));
  assert.ok((await recentLessons(agent.id)).some((l) => l.kind === "discarded" && l.fix === fix), "a discarded fix is remembered");
  await forgetLessons(agent.id);

  await saveVersion(agent.id, { label: "Created", origin: "created" });
  const applied = await provenSession(agent.id, "tst_mug", patches);
  assert.ok((await applyImprovement(applied, user.id)).ok);
  assert.equal((await listActions(agent.id))[0].description, "Use it when an item arrives broken.");
  assert.ok((await recentLessons(agent.id)).some((l) => l.kind === "applied" && l.fix === fix));
  const improvement = (await listVersions(agent.id)).find((v) => v.origin === "improvement")!;
  assert.equal(improvement.improvement?.fixes[0].fix, fix, "the version knows which fix it applied");

  const created = (await listVersions(agent.id)).find((v) => v.label === "Created")!;
  assert.ok((await restoreVersion(agent.id, created.id, user.id)).ok);
  assert.notEqual((await listActions(agent.id))[0].description, "Use it when an item arrives broken.", "restoring undoes it");
  assert.ok((await recentLessons(agent.id)).some((l) => l.kind === "undone" && l.fix === fix), "and undoing it is remembered");
  assert.match((await ruledOut(memoryStore(), agent.id, fix, (await agentFingerprint(agent.id)) ?? "")) ?? "", /turned this fix down/, "so it isn't proposed again");

  assert.ok((await restoreVersion(agent.id, improvement.id, user.id)).ok, "undoing the undo");
  assert.ok(!(await recentLessons(agent.id)).some((l) => l.kind === "undone" && l.fix === fix), "brings the fix back, and it's no longer ruled out");
});
