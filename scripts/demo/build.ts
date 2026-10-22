// Building the demo business (Harbor Goods, made up: harbor-goods.ts) in an account's workspace: its knowledge, goals,
// order lookup and tests, its tests run once, sample chats (marked Sample) and a quality check, so every page has
// results to show from the first minute. Used by `npm run demo` and `npm run judge-accounts`. The environment must be
// loaded before this file is imported. Building it never emails anyone.

import { readFileSync } from "node:fs";
import { qaText } from "../../src/core/agents";
import { PROCEDURE_TEMPLATES } from "../../src/core/procedures";
import { db, system } from "../../src/lib/db";
import { withTenant } from "../../src/lib/tenant";
import { createAction, listActions } from "../../src/platform/actions";
import { analyzeConversations } from "../../src/platform/analysis";
import { converse } from "../../src/platform/chat/converse";
import { demoOrder, DEMO_ORDER_PATH } from "../../src/platform/demo-orders";
import { setGoal, startingGoals } from "../../src/platform/goals";
import { queueTraining, settled } from "../../src/platform/knowledge/jobs";
import { asPicture } from "../../src/platform/pictures";
import { saveProcedure } from "../../src/platform/procedures";
import { getQualityCheck, startQualityCheck } from "../../src/platform/quality";
import { addSource, createAgent, getAgent, listAgents, updateAgent } from "../../src/platform/store";
import { findGaps } from "../../src/platform/suggestions";
import { generateTests, latestRuns, listTests, runTests, saveTest } from "../../src/platform/tests";
import { saveVersion } from "../../src/platform/versions";
import { saveWidget } from "../../src/platform/widgets";
import * as demo from "./harbor-goods";

/** Builds Harbor Goods for the account with this email; returns its address, or undefined (and says why). */
export async function buildDemo(email: string, say: (line: string) => void): Promise<string | undefined> {
  const owner = await system()
    .prepare("SELECT u.id AS user_id, m.workspace_id FROM users u JOIN members m ON m.user_id = u.id WHERE lower(u.email) = lower(?) AND m.role = 'owner' LIMIT 1")
    .get<{ user_id: string; workspace_id: string }>(email);
  if (!owner) {
    say(`There's no account for ${email}. Make it first (npm run create-account), then run this again.`);
    return undefined;
  }
  return withTenant(owner.workspace_id, async (): Promise<string | undefined> => {
    if ((await listAgents(owner.workspace_id)).some((a) => a.name === demo.NAME)) {
      say(`This workspace already has ${demo.NAME}. Delete it in Keel (its Settings page) to make it again.`);
      return undefined;
    }

    say(`Creating ${demo.NAME}…`);
    const agent = await createAgent(owner.workspace_id, demo.NAME, {
      industry: "retail",
      config: { instructions: demo.INSTRUCTIONS, profile: demo.PROFILE, appearance: demo.APPEARANCE, protection: { spam: { enabled: true, definition: "Gibberish, insults, adverts or links to other shops." } } },
    });
    // A shop's goals (reach a person, returns, next questions), and leads for the wholesale team.
    await startingGoals(agent.id, "retail");
    await setGoal(agent.id, "leads", true);

    // Its order system (made up, on this server): an order lookup, shown as an order tracker, and the guide that uses it.
    const base = (process.env.KEEL_PUBLIC_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    const sample = demoOrder("HG-1043").body;
    const tracker = await saveWidget(agent.id, { template: "tracker", name: "Order tracker", mapping: { title: "title", steps: "steps", current: "status" }, sample: JSON.stringify(sample, null, 2) });
    await createAction(agent.id, "api", {
      name: "look_up_order",
      title: "Look up an order",
      description: "Use when the customer asks where their order is or when it will arrive, once you have their order number (like HG-1043).",
      config: { method: "GET", url: `${base}${DEMO_ORDER_PATH}{order_number}`, headers: [], params: [{ name: "order_number", type: "string", description: "The order number, like HG-1043", required: true }], widgetId: tracker.id },
    });
    const guide = PROCEDURE_TEMPLATES.find((t) => t.name === "Where is my order")!;
    const ticket = (await listActions(agent.id)).find((a) => a.kind === "escalate")!;
    await saveProcedure(agent.id, { name: guide.name, trigger: guide.trigger, steps: guide.steps.replaceAll("@create_ticket", `@${ticket.name}`) });
    await saveVersion(agent.id, { label: "Created", origin: "created", authorId: owner.user_id });

    say(`Teaching it ${demo.SOURCES.length} pages and ${demo.QAS.length} Q&As…`);
    for (const s of demo.SOURCES) await queueTraining((await addSource(agent.id, { kind: "text", title: s.title, content: s.content })).id);
    for (const q of demo.QAS) await queueTraining((await addSource(agent.id, { kind: "qa", title: q.question, content: qaText(q.question, q.answer) })).id);
    await settled();

    say(`Writing tests: ${demo.TESTS.length + 1} of ours, 6 written by Keel…`);
    for (const t of demo.TESTS) await saveTest(agent.id, { ...t, maxTurns: 6 });
    // In tests, the order system isn't called: the lookup answers what a real one would.
    await saveTest(agent.id, { ...demo.ORDER_TEST, actionResponses: { look_up_order: sample }, maxTurns: 2 });
    await generateTests((await getAgent(agent.id))!, 6);
    const tests = await listTests(agent.id);

    say(`Running the ${tests.length} tests…`);
    await runTests(agent.id, tests.map((t) => t.id));
    await settled();
    const runs = [...(await latestRuns(agent.id)).values()];
    say(`  ${runs.filter((r) => r.status === "passed").length} of ${runs.length} passed`);
    for (const r of runs.filter((r) => r.status !== "passed")) say(`  ✗ ${tests.find((t) => t.id === r.testId)?.name}: ${r.verdict?.reasons?.[0] ?? r.status}`);

    say(`Answering ${demo.SAMPLE_CHATS.length} sample chats, marked as samples…`);
    for (const [i, chat] of demo.SAMPLE_CHATS.entries()) {
      let conversationId: string | undefined;
      // A photo goes with the chat's first message (a drawing made for Keel's tests, read by NVIDIA's vision model).
      const picture = chat.photo ? asPicture(readFileSync(new URL(`../../src/testing/fixtures/${chat.photo}`, import.meta.url))) : undefined;
      for (const [n, message] of chat.messages.entries())
        conversationId = (await converse({ agent: (await getAgent(agent.id))!, channel: "widget", conversationId, message, ...(n === 0 && picture ? { picture } : {}), visitor: `sample-${i + 1}` })).conversationId;
      // Dated over the last days, as if they'd come in then: the charts and "what customers ask" read them that way.
      const start = new Date(Date.now() - chat.daysAgo * 86_400_000);
      const at = (seconds: number) => new Date(start.getTime() + seconds * 1000).toISOString();
      const ids = (await db().prepare("SELECT id FROM messages WHERE conversation_id = ? ORDER BY id").all<{ id: number }>(conversationId!)).map((m) => m.id);
      for (const [n, id] of ids.entries()) await db().prepare("UPDATE messages SET created_at = ? WHERE id = ?").run(at(n * 40), id);
      await db().prepare("UPDATE conversations SET started_at = ?, last_at = ?, meta = (meta::jsonb || '{\"sample\": true}')::text WHERE id = ?").run(at(0), at(Math.max(0, ids.length - 1) * 40), conversationId!);
      await db().prepare("UPDATE tickets SET created_at = ?, updated_at = ? WHERE conversation_id = ?").run(at(60), at(60), conversationId!);
      await db().prepare("UPDATE ticket_events SET created_at = ? WHERE ticket_id IN (SELECT id FROM tickets WHERE conversation_id = ?)").run(at(60), conversationId!);
    }
    await settled();
    const read = await analyzeConversations(agent.id);
    const gaps = await findGaps(agent.id);
    say(`  ${read} read for topics and feelings; ${gaps} question${gaps === 1 ? "" : "s"} nothing answered, in Answers to add`);

    say("Checking quality: 10 questions graded blind, the tests and the judges checked…");
    const started = await startQualityCheck(agent.id, owner.user_id);
    if ("error" in started) say(`  ${started.error}`);
    else {
      await settled();
      const check = await getQualityCheck(started.id);
      const report = check?.report;
      if (!report) say(`  The check didn't finish: ${check?.error ?? check?.status}`);
      else {
        say(`  Answers ${report.score.toFixed(1)} out of 10 (the best Keel can give: ${report.bestScore.toFixed(1)})`);
        say(`  Tests sound: ${report.tests.filter((t) => t.sound).length} of ${report.tests.length}; judges caught ${report.judges.filter((j) => j.caught).length} of ${report.judges.length} planted mistakes`);
        for (const a of report.answers.filter((a) => a.score < 8 || a.wrongFacts.length)) say(`  · ${a.score}/10 (${a.kind}) "${a.question}": ${a.why}${a.wrongFacts.length ? ` Wrong: ${a.wrongFacts.join("; ")}` : ""}`);
        for (const n of report.notes) say(`  note: ${n}`);
        say(`  ${check.tokens.toLocaleString()} tokens, about $${check.costUsd.toFixed(2)}`);
      }
    }
    await updateAgent(agent.id, { enabled: true });
    return `${process.env.KEEL_PUBLIC_URL ?? "http://localhost:3000"}/app/agents/${agent.id}`;
  });
}
