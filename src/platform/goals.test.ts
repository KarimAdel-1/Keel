import { test } from "node:test";
import assert from "node:assert/strict";
import { setTestTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";
import { signUp } from "./accounts";
import { listActions } from "./actions";
import { goalStatus, setGoal, startingGoals } from "./goals";
import { listProcedures } from "./procedures";
import { applyTodoFix, todos } from "./setup";
import { createAgent, getAgent } from "./store";

offline("goals");

async function agentFor(industry: "retail" | "other") {
  const { workspace } = await signUp({ email: `g${Math.random().toString(36).slice(2)}@example.com`, name: "Gus", password: "long enough" });
  setTestTenant(workspace.id);
  return createAgent(workspace.id, "Harbor Goods", { industry });
}

test("a shop starts with what shops need: a person to reach, returns handled, next questions suggested", async () => {
  const agent = await agentFor("retail");
  await startingGoals(agent.id, "retail");
  const on = (await goalStatus(agent.id)).filter((g) => g.on).map((g) => g.key);
  assert.deepEqual(on.sort(), ["followups", "person", "returns"]);
  const actions = await listActions(agent.id);
  assert.deepEqual(actions.map((a) => a.name).sort(), ["create_ticket", "hand_over_to_person", "show_return_form", "suggest_followups"], "one ticket action, shared by two goals");
  const returns = (await listProcedures(agent.id)).find((p) => p.name === "Return or refund")!;
  assert.match(returns.steps, /@show_return_form/, "the guide calls the form the agent really has");
  assert.doesNotMatch(returns.steps, /@show_request_form/);

  // Bookings too: its own form, so the two don't clash.
  await setGoal(agent.id, "bookings", true);
  const booking = (await listProcedures(agent.id)).find((p) => p.name === "Make a booking request")!;
  assert.match(booking.steps, /@show_booking_form/);
  assert.equal((await listActions(agent.id)).filter((a) => a.kind === "form").length, 2);
  await setGoal(agent.id, "bookings", true);
  assert.equal((await listProcedures(agent.id)).filter((p) => p.name === "Make a booking request").length, 1, "choosing a goal twice changes nothing");
});

test("turning a goal off switches off only what no other goal needs, and deletes nothing", async () => {
  const agent = await agentFor("retail");
  await startingGoals(agent.id, "retail");
  await setGoal(agent.id, "person", false);
  const actions = await listActions(agent.id);
  assert.equal(actions.find((a) => a.name === "hand_over_to_person")?.enabled, false);
  assert.equal(actions.find((a) => a.name === "create_ticket")?.enabled, true, "returns still needs the ticket");
  assert.equal((await listProcedures(agent.id)).find((p) => p.name === "Hand over to a person")?.enabled, false);
  assert.equal(actions.length, 4, "nothing deleted");
  assert.equal((await goalStatus(agent.id)).find((g) => g.key === "person")?.on, false);
  await setGoal(agent.id, "person", true);
  assert.equal((await goalStatus(agent.id)).find((g) => g.key === "person")?.on, true, "and it comes back as it was");
  assert.equal((await listActions(agent.id)).length, 4);
});

test("the to-do list puts what leaves customers stuck first, and its one-click fixes work", async () => {
  const agent = await agentFor("other");
  const first = await todos(agent);
  assert.deepEqual(first.slice(0, 2).map((t) => t.key).sort(), ["knowledge", "person"], "no knowledge and no way to a person come first");
  assert.equal(first.find((t) => t.key === "person")?.fix?.kind, "reach_person");

  await applyTodoFix(agent, "reach_person");
  const after = await todos((await getAgent(agent.id))!);
  assert.equal(after.find((t) => t.key === "person"), undefined, "fixed in one click");
  assert.ok(after.find((t) => t.key === "alerts"), "and now: no one hears about it (this server sends no email and has no Slack)");

  await applyTodoFix((await getAgent(agent.id))!, "spam");
  assert.equal((await getAgent(agent.id))!.config.protection.spam.enabled, true);
});
