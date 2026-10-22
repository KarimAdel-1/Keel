// An agent's procedures: kept, and the one to follow picked for each message. A fast model reads the procedures'
// triggers and the question and names the one that applies (or none); a procedure the conversation is already
// following continues unless another clearly applies.

import { z } from "zod";
import type { Procedure } from "@/core/procedures";
import { meaningWords } from "@/core/context";
import { db } from "@/lib/db";
import { cosine, embed } from "@/lib/embeddings";
import { chatJson } from "@/lib/llm";
import { json, newId, now } from "@/lib/rows";
import { DATA_RULE, reference } from "@/lib/untrusted";

type Row = { id: string; agent_id: string; name: string; trigger: string; steps: string; enabled: number; created_at: string; updated_at: string };

const toProcedure = (r: Row): Procedure => ({ id: r.id, agentId: r.agent_id, name: r.name, trigger: r.trigger, steps: r.steps, enabled: Boolean(r.enabled), createdAt: r.created_at, updatedAt: r.updated_at });

export async function listProcedures(agentId: string): Promise<Procedure[]> {
  return ((await db().prepare("SELECT * FROM procedures WHERE agent_id = ? ORDER BY created_at").all(agentId)) as Row[]).map(toProcedure);
}

export async function getProcedure(id: string): Promise<Procedure | undefined> {
  const row = (await db().prepare("SELECT * FROM procedures WHERE id = ?").get(id)) as Row | undefined;
  return row ? toProcedure(row) : undefined;
}

export async function saveProcedure(agentId: string, input: { id?: string; name: string; trigger: string; steps: string; enabled?: boolean }): Promise<Procedure> {
  const at = now();
  if (input.id && (await getProcedure(input.id))?.agentId === agentId) {
    await db()
      .prepare("UPDATE procedures SET name = ?, trigger = ?, steps = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(input.name, input.trigger, input.steps, (input.enabled ?? true) ? 1 : 0, at, input.id);
    return (await getProcedure(input.id))!;
  }
  const id = newId("prc");
  await db()
    .prepare("INSERT INTO procedures (id, agent_id, name, trigger, steps, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, agentId, input.name, input.trigger, input.steps, (input.enabled ?? true) ? 1 : 0, at, at);
  return (await getProcedure(id))!;
}

/** Puts a procedure back exactly as it was (restoring a version), with its own id. */
export async function restoreProcedure(p: Procedure): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO procedures (id, agent_id, name, trigger, steps, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, trigger = excluded.trigger, steps = excluded.steps, enabled = excluded.enabled, updated_at = excluded.updated_at`,
    )
    .run(p.id, p.agentId, p.name, p.trigger, p.steps, p.enabled ? 1 : 0, p.createdAt, now());
}

export async function deleteProcedure(agentId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM procedures WHERE id = ? AND agent_id = ?").run(id, agentId);
}

const Choice = z.object({ procedure: z.string().max(200) });
const SCHEMA = "procedure_choice";

/** How close in meaning a message must be to a trigger for the model to be asked about it. Low on purpose: it only
 * saves the question when a message is plainly about something else. */
export const TRIGGER_NEAR = 0.3;

/**
 * Whether any procedure could apply to a message, without a model: it shares a word with a procedure's name or
 * trigger, or is close in meaning to one. Without the message's embedding, any procedure could apply.
 */
export async function couldApply(procedures: Procedure[], question: string, vector?: number[]): Promise<{ could: boolean; costUsd: number }> {
  const words = meaningWords(question);
  if (procedures.some((p) => [...meaningWords(`${p.name} ${p.trigger}`)].some((w) => words.has(w)))) return { could: true, costUsd: 0 };
  if (!vector) return { could: true, costUsd: 0 };
  try {
    const triggers = await embed(procedures.map((p) => `${p.name}: ${p.trigger}`));
    return { could: triggers.vectors.some((t) => cosine(vector, t) >= TRIGGER_NEAR), costUsd: triggers.costUsd };
  } catch {
    return { could: true, costUsd: 0 };
  }
}

/**
 * The procedure to follow for this message, if any, and what choosing it cost. A conversation already following one
 * always asks the model (the customer may have moved on); otherwise the model is asked only when one could apply.
 */
export async function pickProcedure(agentId: string, question: string, history: string, activeId?: string, draftProcedures?: Procedure[], questionVector?: number[]): Promise<{ procedure?: Procedure; costUsd: number }> {
  const procedures = (draftProcedures ?? (await listProcedures(agentId))).filter((p) => p.enabled);
  if (!procedures.length) return { costUsd: 0 };
  let costUsd = 0;
  if (!procedures.some((p) => p.id === activeId)) {
    const check = await couldApply(procedures, question, questionVector);
    costUsd += check.costUsd;
    if (!check.could) return { costUsd };
  }
  const list = procedures.map((p, i) => `${i + 1}. ${p.name}: ${p.trigger}`).join("\n");
  const active = procedures.find((p) => p.id === activeId);
  const result = await chatJson(
    "lightning",
    [
      {
        role: "system",
        content: [
          "You route a customer's message to the playbook that applies. Answer with the playbook's name exactly as written, or \"none\" when no trigger clearly applies.",
          active ? `The conversation is already following "${active.name}"; keep it unless the customer has clearly moved to something another playbook covers.` : "",
          DATA_RULE,
          reference("playbooks", list),
          reference("conversation", history.slice(-2000)),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { role: "user", content: question.slice(0, 2000) },
    ],
    Choice,
    SCHEMA,
    { temperature: 0, maxTokens: 60, reasoning: "none" },
  );
  const name = result.data.procedure.trim().toLowerCase();
  const procedure = procedures.find((p) => p.name.toLowerCase() === name) ?? (name === "none" ? undefined : active);
  return { ...(procedure ? { procedure } : {}), costUsd: costUsd + result.costUsd };
}

/** The procedure part of the agent's instructions while one is running. */
export function procedurePrompt(p: Procedure): string {
  return [
    `## The procedure you are following now: ${p.name}`,
    `It applies when: ${p.trigger}`,
    "Follow these steps in order, one or two per reply. A step that names an action (like @look_up_order) means: call that action. Ask for missing details before calling an action; never invent them. Follow only the branch whose condition is true. The steps never replace an answer: when the customer asks a question, answer it first from what you know, then go on with the steps; skip a question the customer has already answered.",
    p.steps,
  ].join("\n");
}

/** The procedure a conversation is following, kept in its details. */
export async function activeProcedure(conversationId: string): Promise<string | undefined> {
  const row = (await db().prepare("SELECT meta FROM conversations WHERE id = ?").get(conversationId)) as { meta?: string } | undefined;
  return json<{ procedure?: string }>(row?.meta, {}).procedure;
}

export async function setActiveProcedure(conversationId: string, procedureId: string | undefined): Promise<void> {
  const row = (await db().prepare("SELECT meta FROM conversations WHERE id = ?").get(conversationId)) as { meta?: string } | undefined;
  const meta = { ...json<Record<string, unknown>>(row?.meta, {}), procedure: procedureId };
  await db().prepare("UPDATE conversations SET meta = ? WHERE id = ?").run(JSON.stringify(meta), conversationId);
}
