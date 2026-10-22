// What a workspace's agents consume. Every model call is metered where it happens (lib/llm.ts reports each one) and
// kept against the agent and the kind of work it was for, in tokens, with its cost for whoever runs Keel. There are
// no limits: Keel keeps consumption low itself (lean prompts, the right model for each message, answers kept for
// repeated questions, early stopping), without making the answers worse.
//
// Work is metered by running it inside `metered()`: every model call made inside, however deep, is counted for that
// agent and kind of work (the innermost `metered()` decides the kind), and the meter it hands over adds up the calls.

import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { observeModelCalls, type ModelCall } from "@/lib/llm";
import { monthWindow, now } from "@/lib/rows";

export type UsageKind = "reply" | "test" | "analysis" | "backstage" | "compare" | "draft" | "improve" | "guardrails" | "security" | "knowledge" | "quality";

export interface Meter {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface Scope extends Meter {
  workspaceId: string;
  agentId?: string;
  kind: UsageKind;
  parent?: Scope;
}

const scopes = ((globalThis as unknown as { __keelUsageScopes?: AsyncLocalStorage<Scope> }).__keelUsageScopes ??= new AsyncLocalStorage<Scope>());

/** Runs `work` with every model call inside it metered for this agent and kind of work. */
export function metered<T>(who: { workspaceId: string; agentId?: string; kind: UsageKind }, work: (meter: Meter) => Promise<T>): Promise<T> {
  const scope: Scope = { ...who, parent: scopes.getStore(), calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return scopes.run(scope, () => work(scope));
}

/** `metered()` for an agent, by its id (the workspace is looked up). */
export async function meteredForAgent<T>(agentId: string, kind: UsageKind, work: (meter: Meter) => Promise<T>): Promise<T> {
  const row = (await db().prepare("SELECT workspace_id FROM agents WHERE id = ?").get(agentId)) as { workspace_id?: string } | undefined;
  return row?.workspace_id ? metered({ workspaceId: row.workspace_id, agentId, kind }, work) : work({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
}

async function record(call: ModelCall): Promise<void> {
  const scope = scopes.getStore();
  if (!scope) return;
  for (let s: Scope | undefined = scope; s; s = s.parent) {
    s.calls++;
    s.inputTokens += call.inputTokens;
    s.outputTokens += call.outputTokens;
    s.costUsd += call.costUsd;
  }
  // For the business the work is metered for, wherever the model call ended (a stream, a background job).
  await withTenant(scope.workspaceId, () =>
    db()
      .prepare("INSERT INTO usage_events (workspace_id, agent_id, kind, task, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(scope.workspaceId, scope.agentId ?? null, scope.kind, call.task, call.model, call.inputTokens, call.outputTokens, call.costUsd, now()),
  );
}

const registered = globalThis as unknown as { __keelUsageObserver?: boolean };
if (!registered.__keelUsageObserver) {
  registered.__keelUsageObserver = true;
  observeModelCalls(record);
}

/** Tokens the agent has used this month. */
export async function agentTokens(agentId: string): Promise<number> {
  const { start } = monthWindow();
  return Number(((await db().prepare("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS n FROM usage_events WHERE agent_id = ? AND created_at >= ?").get(agentId, start)) as { n: number }).n);
}

export interface UsageBreakdown {
  days: { date: string; tokens: number }[];
  byAgent: { agentId: string; name: string; tokens: number; calls: number }[];
  byKind: { kind: UsageKind; tokens: number; calls: number }[];
  /** By what each call was for (src/platform/crew.ts ties these to Keel's agents). */
  byTask: { task: string; tokens: number; calls: number }[];
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** Opening questions answered from memory this month, with no model call (src/platform/chat/answer-cache.ts). */
  keptAnswers: number;
  /** Customer replies this month, and how many of them went to the fast model. */
  replies: number;
  fastReplies: number;
}

/** This month's consumption by day, by agent and by kind of work, for the Usage page. */
export async function usageBreakdown(workspaceId: string): Promise<UsageBreakdown> {
  const { start } = monthWindow();
  const tokens = "SUM(input_tokens + output_tokens)";
  const days = (await db()
    .prepare(`SELECT substr(created_at, 1, 10) AS date, ${tokens} AS tokens FROM usage_events WHERE workspace_id = ? AND created_at >= ? GROUP BY date ORDER BY date`)
    .all(workspaceId, start)) as { date: string; tokens: number }[];
  const byAgent = (await db()
    .prepare(
      `SELECT u.agent_id AS "agentId", COALESCE(a.name, 'Deleted agent') AS name, SUM(u.input_tokens + u.output_tokens) AS tokens, COUNT(*) AS calls
       FROM usage_events u LEFT JOIN agents a ON a.id = u.agent_id
       WHERE u.workspace_id = ? AND u.created_at >= ? GROUP BY u.agent_id, a.name ORDER BY tokens DESC`,
    )
    .all(workspaceId, start)) as UsageBreakdown["byAgent"];
  const byKind = (await db()
    .prepare(`SELECT kind, ${tokens} AS tokens, COUNT(*) AS calls FROM usage_events WHERE workspace_id = ? AND created_at >= ? GROUP BY kind ORDER BY tokens DESC`)
    .all(workspaceId, start)) as UsageBreakdown["byKind"];
  const byTask = (await db()
    .prepare(`SELECT task, ${tokens} AS tokens, COUNT(*) AS calls FROM usage_events WHERE workspace_id = ? AND created_at >= ? GROUP BY task ORDER BY tokens DESC`)
    .all(workspaceId, start)) as UsageBreakdown["byTask"];
  const totals = (await db()
    .prepare("SELECT COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output, COUNT(*) AS calls FROM usage_events WHERE workspace_id = ? AND created_at >= ?")
    .get(workspaceId, start)) as { input: number; output: number; calls: number };
  const answers = (await db()
    .prepare(
      `SELECT COUNT(*) AS replies, COUNT(*) FILTER (WHERE (m.meta::jsonb->>'kept') = 'true') AS kept, COUNT(*) FILTER (WHERE (m.meta::jsonb->>'model') ILIKE '%Lightning%') AS fast
       FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN agents a ON a.id = c.agent_id
       WHERE a.workspace_id = ? AND m.role = 'assistant' AND c.channel NOT IN ('test') AND m.created_at >= ? AND (m.meta::jsonb->>'model') IS NOT NULL`,
    )
    .get(workspaceId, start)) as { replies: number; kept: number | null; fast: number | null };
  return {
    days: days.map((d) => ({ date: d.date, tokens: Number(d.tokens) })),
    byAgent: byAgent.map((a) => ({ ...a, tokens: Number(a.tokens), calls: Number(a.calls) })),
    byKind: byKind.map((k) => ({ ...k, tokens: Number(k.tokens), calls: Number(k.calls) })),
    byTask: byTask.map((t) => ({ ...t, tokens: Number(t.tokens), calls: Number(t.calls) })),
    inputTokens: Number(totals.input),
    outputTokens: Number(totals.output),
    calls: Number(totals.calls),
    keptAnswers: Number(answers.kept ?? 0),
    replies: Number(answers.replies),
    fastReplies: Number(answers.fast ?? 0),
  };
}
