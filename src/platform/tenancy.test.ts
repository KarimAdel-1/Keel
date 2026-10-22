import { test } from "node:test";
import assert from "node:assert/strict";
import { TENANT_TABLES, db, system } from "@/lib/db";
import { currentTenant, setTestTenant, withTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";
import { signUp } from "./accounts";
import { getTicket, openTicket } from "./helpdesk";
import { visitorAgent } from "./session";
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
