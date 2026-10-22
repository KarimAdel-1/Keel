import { test } from "node:test";
import assert from "node:assert/strict";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { backstageMessages } from "./backstage";
import { ASKS_FOR, askCopilot } from "./copilot";
import { CREW, crewFor } from "./crew";
import { listImprovements, stopImprovement } from "./improve";
import { notesOf } from "./memory";
import { addSource, createAgent } from "./store";
import { queueTraining, settled } from "./knowledge/jobs";
import { listRuns, saveTest } from "./tests";
import { usageBreakdown } from "./usage";

// Model calls here: the Copilot's routing (Nemotron 3 Super) for five requests, the Analyst once, one test run.
const { skip } = live("copilot", 70_000);

async function shop() {
  const { user, workspace } = await signUp({ email: `c${Math.random().toString(36).slice(2)}@example.com`, name: "Cy", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  await queueTraining((await addSource(agent.id, { kind: "text", title: "Returns", content: "# Returns\nYou can return any item within 30 days of delivery for a full refund. Returns are free in the UK.\n# Shipping\nStandard shipping takes 3 to 5 business days." })).id);
  await settled();
  return { user, workspace, agent };
}

test("the Copilot hands each request to the right specialist, saves the builder's preferences, and starts work only when asked", { skip }, async () => {
  const { user, workspace, agent } = await shop();
  await saveTest(agent.id, { name: "Returns", persona: "A customer who asks how many days they have to return an item.", criterion: "The assistant says items can be returned within 30 days of delivery.", maxTurns: 2 });

  const question = await askCopilot(agent, "What should I fix first?", user.id);
  assert.deepEqual(question.by, ["Analyst"], "a question about the agent goes to the Analyst");
  assert.ok(question.content.length > 0);
  assert.equal((await listRuns(agent.id)).length + (await listImprovements(agent.id)).length, 0, "and starts no work");

  const note = await askCopilot(agent, "From now on, never change my agent's friendly tone. Also, read the conversations.", user.id);
  assert.ok((await notesOf(agent.id)).some((n) => /tone/i.test(n.text)), `the preference is saved in shared memory (${note.content})`);
  assert.ok(note.by.includes("Conversation reader"), "and the request that came with it is handed over");

  const tests = await askCopilot(agent, "Run my tests", user.id);
  assert.deepEqual(tests.by, ["Test runner"]);
  await settled();
  assert.equal((await listRuns(agent.id)).length, 1, "the test ran");

  const improve = await askCopilot(agent, "Improve my agent", user.id);
  assert.deepEqual(improve.by, ["Improvement agent"]);
  const session = (await listImprovements(agent.id))[0];
  assert.ok(session, "an improvement session started");
  await stopImprovement(session.id);
  await settled();

  const hello = await askCopilot(agent, "Hello!", user.id);
  assert.deepEqual(hello.by, ["Copilot"], "a greeting is answered by the Copilot itself");
  assert.equal((await backstageMessages(agent.id)).filter((m) => m.role === "user").length, 5, "the conversation keeps both sides");

  // Every model call above was metered, and each belongs to one of Keel's agents.
  const usage = (await usageBreakdown(workspace.id));
  assert.ok(usage.byKind.some((k) => k.kind === "backstage" && k.tokens > 0));
  assert.ok(usage.byTask.every((t) => crewFor(t.task)), `every call belongs to a known agent (${usage.byTask.map((t) => t.task).join(", ")})`);
});

test("background work starts only when the builder asks for it in so many words", async () => {
  const asks = (s: keyof typeof ASKS_FOR, m: string) => ASKS_FOR[s]!.test(m);
  assert.ok(!asks("tester", "What should I fix first?") && !asks("improver", "What should I fix first?"), "a question about what to fix starts nothing");
  assert.ok(!asks("security", "What did the last security scan find?"), "nor does a question about a scan");
  assert.ok(asks("tester", "Run my tests") && asks("tester", "Can you run the tests again?"));
  assert.ok(asks("improver", "Improve my agent") && asks("improver", "Please fix it"));
  assert.ok(asks("security", "Run a security scan") && asks("security", "Attack my agent"));
  assert.ok(asks("quality", "Check the quality of my agent") && asks("quality", "Run a quality check"));
  assert.ok(!asks("quality", "How good is my agent?"), "a question about quality goes to the Analyst, who reads the latest check");
});

test("every task the meter records belongs to one of Keel's agents, and none to two", async () => {
  assert.ok(crewFor("copilot")?.name === "Copilot" && crewFor("test_judgement")?.team === "Testing");
  assert.equal(new Set(CREW.flatMap((m) => m.tasks)).size, CREW.flatMap((m) => m.tasks).length);
});
