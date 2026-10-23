import { test } from "node:test";
import assert from "node:assert/strict";
import { TENANT_TABLES, db, system } from "@/lib/db";
import { now } from "@/lib/rows";
import { currentTenant, setTestTenant, withTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";
import { signUp } from "./accounts";
import { getTicket, listTickets, openTicket, openTicketsByAgent, setStatus, ticketCounts } from "./helpdesk";
import { startImprovement } from "./improve";
import { startQualityCheck } from "./quality";
import { startScan } from "./security";
import { visitorAgent } from "./session";
import { LIMIT_REACHED, SERVER_LIMIT_REACHED, limitReached } from "./usage";
import { addMessage, addSource, agentChunks, conversationMessages, createAgent, deleteAgent, getAgent, listAgents, listSources, replaceChunks, startConversation, updateAgent } from "./store";

offline("tenancy");

/** A business with an agent, some knowledge, a conversation and a ticket. */
async function business(name: string) {
  const { workspace } = await signUp({ email: `${name.toLowerCase()}${Math.random().toString(36).slice(2)}@example.com`, name, password: "long enough" });
  return withTenant(workspace.id, async () => {
    const agent = await createAgent(workspace.id, `${name}'s shop`);
    const source = await addSource(agent.id, { kind: "text", title: "Prices", content: `${name}'s secret price list: everything costs 7.` });
    await replaceChunks(source.id, [{ text: `${name}'s secret price list: everything costs 7.` }]);
    const conversationId = await startConversation(agent.id, "widget");
    await addMessage(conversationId, { role: "user", content: `I'm a customer of ${name}.` });
    const ticket = await openTicket({ agentId: agent.id, conversationId, subject: "Help", summary: `${name}'s customer needs help.` });
    return { workspaceId: workspace.id, agent, source, conversationId, ticket };
  });
}

test("one business never sees another's data: agents, knowledge, conversations, tickets", async () => {
  const a = await business("Ada");
  const b = await business("Ben");
  setTestTenant(b.workspaceId);
  assert.equal(await getAgent(a.agent.id), undefined, "B can't open A's agent by its id");
  assert.deepEqual((await listAgents(a.workspaceId)).map((x) => x.id), [], "nor list A's agents");
  assert.deepEqual(await listSources(a.agent.id), [], "nor read A's knowledge");
  assert.deepEqual(await conversationMessages(a.conversationId), [], "nor A's conversations");
  assert.equal(await getTicket(a.ticket.id), undefined, "nor A's tickets");
  assert.deepEqual(await agentChunks(a.agent.id), [], "nor A's knowledge kept in memory");

  await withTenant(a.workspaceId, async () => assert.equal((await agentChunks(a.agent.id)).length, 1, "A reads its own"));
  assert.deepEqual(await agentChunks(a.agent.id), [], "and what A read stays A's, even from memory");
});

test("one business can't change or delete another's data, or write into it", async () => {
  const a = await business("Cal");
  const b = await business("Dee");
  setTestTenant(b.workspaceId);
  assert.equal(await updateAgent(a.agent.id, { name: "Taken over" }), undefined);
  await deleteAgent(a.agent.id);
  assert.equal((await db().prepare("UPDATE conversations SET status = 'closed' WHERE id = ?").run(a.conversationId)).changes, 0);
  await assert.rejects(
    () => db().prepare("INSERT INTO agents (id, workspace_id, name, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("agt_planted", a.workspaceId, "Planted", "{}", "2026", "2026"),
    /row-level security/,
    "a row for another business is refused by the database itself",
  );

  const after = await withTenant(a.workspaceId, () => getAgent(a.agent.id));
  assert.equal(after?.name, "Cal's shop", "A's agent is untouched");
  assert.equal((await withTenant(a.workspaceId, () => conversationMessages(a.conversationId))).length, 1);
});

test("with no business set, a business's data can't be read at all", async () => {
  const a = await business("Eve");
  setTestTenant(undefined);
  assert.equal(await currentTenant(), undefined);
  await assert.rejects(() => db().prepare("SELECT * FROM agents").all(), /no business set/);
  await assert.rejects(() => getAgent(a.agent.id), /no business set/);
});

test("the database enforces it: every business table has row-level security, and Keel's login can't get around it", async () => {
  const tables = await system().prepare("SELECT relname, relrowsecurity FROM pg_class WHERE relname = ANY(?) AND relkind = 'r'").all<{ relname: string; relrowsecurity: boolean }>([...TENANT_TABLES]);
  assert.equal(tables.length, TENANT_TABLES.length);
  assert.deepEqual(tables.filter((t) => !t.relrowsecurity).map((t) => t.relname), [], "row-level security is on for every one");

  const me = await withTenant("none", () => db().prepare("SELECT current_user AS name, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS super").get<{ name: string; bypass: boolean; super: boolean }>());
  assert.equal(me?.bypass, false, `${me?.name} can't bypass row-level security`);
  assert.equal(me?.super, false);
  const owned = await system().prepare("SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = ?").get<{ n: number }>(me!.name);
  assert.equal(owned?.n, 0, "and owns none of the tables (an owner isn't held to its own policies)");
});

test("a private server (KEEL_PRIVATE): an agent's chat answers only people signed in to its own workspace", async () => {
  const owner = await signUp({ email: `o${Math.random().toString(36).slice(2)}@example.com`, name: "Owner", password: "long enough" });
  const stranger = await signUp({ email: `s${Math.random().toString(36).slice(2)}@example.com`, name: "Stranger", password: "long enough" });
  const agent = await withTenant(owner.workspace.id, () => createAgent(owner.workspace.id, "Harbor Goods"));
  const visit = (who: typeof owner.user | undefined) => withTenant(undefined, () => visitorAgent(agent.id, async () => who));
  const before = process.env.KEEL_PRIVATE;
  process.env.KEEL_PRIVATE = "1";
  try {
    assert.equal(await visit(undefined), undefined, "nobody signed in gets nothing");
    assert.equal(await visit(stranger.user), undefined, "nor does someone from another workspace");
    assert.equal((await visit(owner.user))?.id, agent.id, "a member of its workspace gets the agent");
  } finally {
    if (before === undefined) delete process.env.KEEL_PRIVATE;
    else process.env.KEEL_PRIVATE = before;
  }
  assert.equal((await visit(undefined))?.id, agent.id, "on an ordinary server the chat is public, as a business's website needs");
});

test("the helpdesk inbox: every agent's tickets in one place, narrowed to one agent when asked", async () => {
  const { user, workspace } = await signUp({ email: `desk${Math.random().toString(36).slice(2)}@example.com`, name: "Desk", password: "long enough" });
  await withTenant(workspace.id, async () => {
    const shop = await createAgent(workspace.id, "Shop");
    const studio = await createAgent(workspace.id, "Studio");
    for (const [agent, subject] of [[shop, "Broken mug"], [shop, "Late order"], [studio, "Workshop date"]] as const) await openTicket({ agentId: agent.id, subject, summary: subject });
    const solved = await openTicket({ agentId: studio.id, subject: "Old question", summary: "Answered." });
    await setStatus(solved.id, "solved");

    assert.deepEqual((await listTickets(workspace.id, "all", user.id)).map((t) => t.subject).sort(), ["Broken mug", "Late order", "Workshop date"], "one inbox holds every agent's open tickets");
    assert.deepEqual((await listTickets(workspace.id, "all", user.id, shop.id)).map((t) => t.subject).sort(), ["Broken mug", "Late order"], "narrowed to one agent, only its tickets");
    assert.equal((await ticketCounts(workspace.id, user.id, studio.id)).solved, 1, "the counts follow the agent chosen");
    assert.deepEqual(await openTicketsByAgent(workspace.id), { [shop.id]: 2, [studio.id]: 1 }, "each agent's open tickets, for the agent list");
  });
});

type Business = Awaited<ReturnType<typeof business>>;

/** What the business's model use cost, recorded as Keel records every call. */
const spend = (who: Business, usd: number) =>
  withTenant(who.workspaceId, () =>
    db().prepare("INSERT INTO usage_events (workspace_id, agent_id, kind, task, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (?, ?, 'test', 'judge', 'm', 1000, 100, ?, ?)").run(who.workspaceId, who.agent.id, usd, now()),
  );
const refusal = (who: Business) => withTenant(who.workspaceId, () => limitReached(who.workspaceId));

/** Runs `work` with these settings, then puts them back. */
async function withSettings(values: Record<string, string>, work: () => Promise<void>): Promise<void> {
  const before = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  try {
    await work();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("a server sharing one balance: each account may use its share (KEEL_ACCOUNT_LIMIT_USD), then starts no heavy work, and no other account is held back", async () => {
  const a = await business("Ana");
  const b = await business("Bo");
  await spend(a, 0.6);
  assert.equal(await refusal(a), undefined, "with no limit set, nothing is refused");
  await withSettings({ KEEL_ACCOUNT_LIMIT_USD: "1" }, async () => {
    assert.equal(await refusal(a), undefined, "under the limit, work starts");
    await spend(a, 0.5);
    assert.equal(await refusal(a), LIMIT_REACHED, "at the limit, it's refused");
    await withTenant(a.workspaceId, async () => {
      assert.deepEqual(await startQualityCheck(a.agent.id), { error: LIMIT_REACHED }, "a quality check doesn't start");
      assert.deepEqual(await startImprovement(a.agent.id, {}), { error: LIMIT_REACHED }, "nor an improvement");
      assert.deepEqual(await startScan(a.agent.id, "quick"), { error: LIMIT_REACHED }, "nor a security scan");
    });
    assert.equal(await refusal(b), undefined, "another account has its own share");
  });
});

test("a server sharing one balance: all accounts together may use the server's pot (KEEL_SERVER_LIMIT_USD), first come, first served", async () => {
  const a = await business("Cy");
  const b = await business("Di");
  const total = Number((await system().prepare("SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM usage_events").get<{ usd: number | string }>())?.usd ?? 0);
  await withSettings({ KEEL_SERVER_LIMIT_USD: String(total + 1), KEEL_ACCOUNT_LIMIT_USD: "0.9" }, async () => {
    await spend(a, 0.6);
    assert.equal(await refusal(a), undefined, "under the pot and its own share, an account starts work");
    await spend(b, 0.5);
    assert.equal(await refusal(b), SERVER_LIMIT_REACHED, "once the accounts together reach the pot, work stops, though this account used less than its share");
    assert.equal(await refusal(a), SERVER_LIMIT_REACHED, "and for every account");
    await withTenant(b.workspaceId, async () => assert.deepEqual(await startQualityCheck(b.agent.id), { error: SERVER_LIMIT_REACHED }, "a quality check doesn't start"));
    await spend(a, 0.4);
    assert.equal(await refusal(a), LIMIT_REACHED, "an account past its own share is told so first");
  });
});
