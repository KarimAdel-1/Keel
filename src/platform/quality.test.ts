import { test } from "node:test";
import assert from "node:assert/strict";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { crewFor } from "./crew";
import { queueTraining, settled } from "./knowledge/jobs";
import { getQualityCheck, plantWrongFact, qualityLine, questionPlan, startQualityCheck } from "./quality";
import { addSource, createAgent } from "./store";
import { listRuns, runTests, saveTest } from "./tests";
import { usageBreakdown } from "./usage";

// Model calls here: two short test runs, then a quality check of four questions (the agent's answers, the best
// answers, Ultra's grades), the tests checked, and the judges checked on the conversations that passed.
const { skip } = live("quality", 220_000);

test("a planted mistake changes one fact in the agent's replies: a price, a number of days, a time of day", async () => {
  const said = (content: string) => [
    { role: "customer" as const, content: "How much is express delivery, and when do I need to order?" },
    { role: "agent" as const, content },
  ];
  const price = plantWrongFact(said("Express delivery costs £9.95 if you order before 1pm."));
  assert.equal(price?.change, "£9.95 → £5.97", "the first fact the agent gave");
  assert.equal(price?.transcript[1].content, "Express delivery costs £5.97 if you order before 1pm.");
  assert.equal(price?.transcript[0].content, said("").at(0)!.content, "the customer's words are never changed");

  assert.equal(plantWrongFact(said("You can return it within 30 days."))?.change, "30 days → 15 days");
  assert.equal(plantWrongFact(said("Damaged items: email a photo within 1 day."))?.change, "1 day → 6 days");
  assert.equal(plantWrongFact(said("Order before 1pm for next-day delivery."))?.change, "1pm → 5pm");
  assert.equal(plantWrongFact(said("Members get 10% off."))?.change, "10% → 5%");
  assert.equal(plantWrongFact(said("Happy to help with anything else!")), undefined, "nothing to change, nothing planted");
});

test("a check asks every kind of question customers ask", async () => {
  assert.deepEqual(questionPlan(10), { simple: 3, several: 2, "follow-up": 2, reworded: 2, "not covered": 1 });
  for (const n of [5, 6, 8, 12]) {
    const plan = questionPlan(n);
    assert.equal(Object.values(plan).reduce((a, b) => a + b, 0), n);
    assert.ok(Object.values(plan).every((k) => k >= 1), `every kind at least once in ${n}`);
  }
});

test("a quality check grades the agent's answers blind, checks its tests, and checks the judges with planted mistakes", { skip }, async () => {
  const { workspace } = await signUp({ email: `q${Math.random().toString(36).slice(2)}@example.com`, name: "Quinn", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  assert.ok(!("id" in (await startQualityCheck(agent.id))), "an agent that knows nothing can't be checked yet");

  await queueTraining((await addSource(agent.id, { kind: "text", title: "Returns", content: "# Returns\nYou can return any unused item within 30 days of delivery for a full refund. UK returns are free with the prepaid label in your order email." })).id);
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Shipping", content: "# Shipping\nStandard UK delivery takes 3 to 5 working days and costs £4.95. Express delivery (next working day if ordered before 1pm) costs £9.95." })).id);
  await settled();
  const tests = [
    await saveTest(agent.id, { name: "Express price", persona: "A customer in a hurry who asks how much express delivery costs.", criterion: "The assistant says express delivery costs £9.95.", maxTurns: 2 }),
    await saveTest(agent.id, { name: "Return window", persona: "A customer who asks how long they have to return an unused item.", criterion: "The assistant says unused items can be returned within 30 days of delivery.", maxTurns: 2 }),
  ];
  await runTests(agent.id, tests.map((t) => t.id));
  await settled();
  const passed = (await listRuns(agent.id)).filter((r) => r.status === "passed").length;

  const started = await startQualityCheck(agent.id, undefined, { questions: 4 });
  assert.ok("id" in started, "the check starts");
  assert.equal(((await startQualityCheck(agent.id)) as { id?: string }).id, (started as { id: string }).id, "one check at a time: asking again joins it");
  await settled();
  const check = (await getQualityCheck(started.id))!;
  assert.equal(check.status, "done", check.error);
  const r = check.report!;
  assert.equal(r.answers.length, 4);
  for (const a of r.answers) {
    assert.ok(a.answer.trim() && a.best.trim(), "the agent's answer and the best one");
    assert.ok(a.score >= 1 && a.score <= 10 && a.bestScore >= 1 && a.bestScore <= 10);
  }
  assert.ok(r.score >= 6, `the agent answers its own knowledge well (${r.score}): ${r.answers.map((a) => `${a.score} ${a.why}`).join(" | ")}`);
  assert.equal(r.tests.length, 2, "both tests checked");
  assert.ok(r.tests.every((t) => t.sound), `both tests match the knowledge: ${r.tests.map((t) => t.why).join(" | ")}`);
  if (passed) assert.ok(r.judges.length > 0 && r.judges.every((j) => j.caught), `the judges catch planted mistakes: ${JSON.stringify(r.judges)}`);
  assert.ok(check.tokens > 0 && check.costUsd > 0);
  assert.match((await qualityLine(agent.id)), /answers .* out of 10/, "the Copilot's Analyst reads the latest check");

  // Every model call is metered as quality work, and each belongs to one of Keel's agents.
  const usage = (await usageBreakdown(workspace.id));
  assert.ok(usage.byKind.some((k) => k.kind === "quality" && k.tokens > 0));
  assert.ok(usage.byTask.every((t) => crewFor(t.task)), `every call belongs to a known agent (${usage.byTask.map((t) => t.task).join(", ")})`);
});
