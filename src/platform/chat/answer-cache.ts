// First answers, kept for a while: the same opening question to the same agent (same settings, actions, procedures
// and knowledge, so the same fingerprint) gets the answer it got before, with no model call. Only plain answers from
// the knowledge are kept: cited, with no action, form or procedure, no hand-over and no fallback. A question counts as
// the same when it has the same words in the same order once case, punctuation, plurals and polite filler are set
// aside ("What are your opening hours?" and "opening hours please"); negations and question words always count. Any
// change to the agent changes its fingerprint, so a kept answer is never served for an agent that has changed since.

import { db } from "@/lib/db";
import { now } from "@/lib/rows";
import type { Citation } from "./answer";
import type { ModelKey } from "@/lib/models";

/** How long an answer is kept. Re-read websites change the fingerprint sooner when their content changes. */
export const KEEP_HOURS = 72;
/** Answers kept per agent; the oldest go first. */
const KEEP_PER_AGENT = 500;

const FILLER = new Set(
  "a an the please pls plz hi hello hey thanks thank you your i me my do does is are am can could would will to of for in on at us we our it its this that be just tell know want like need ok okay so".split(" "),
);

const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The question as the cache compares it; empty when nothing meaningful is left. */
export function questionKey(question: string): string {
  const words = question.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((w) => !FILLER.has(w))
    .map(stem)
    .join(" ")
    .slice(0, 300);
}

export interface KeptAnswer {
  text: string;
  citations: Citation[];
  model: ModelKey;
  confidence: number;
  usedMeaning: boolean;
  followups: string[];
}

const keyOf = (question: string, channel: string | undefined) => {
  const words = questionKey(question);
  return words ? `${channel ?? ""}|${words}` : "";
};

/** The kept answer to this question, if the agent hasn't changed since. */
export async function keptAnswer(agentId: string, fingerprint: string, question: string, channel?: string): Promise<KeptAnswer | undefined> {
  const key = keyOf(question, channel);
  if (!key) return undefined;
  const since = new Date(Date.now() - KEEP_HOURS * 3_600_000).toISOString();
  const row = (await db().prepare("SELECT reply FROM answer_cache WHERE agent_id = ? AND key = ? AND fingerprint = ? AND created_at >= ?").get(agentId, key, fingerprint, since)) as { reply: string } | undefined;
  if (!row) return undefined;
  await db().prepare("UPDATE answer_cache SET hits = hits + 1 WHERE agent_id = ? AND key = ?").run(agentId, key);
  try {
    return JSON.parse(row.reply) as KeptAnswer;
  } catch {
    return undefined;
  }
}

/** Keeps an answer for this question and agent state. */
export async function keepAnswer(agentId: string, fingerprint: string, question: string, channel: string | undefined, answer: KeptAnswer): Promise<void> {
  const key = keyOf(question, channel);
  if (!key) return;
  await db()
    .prepare("INSERT INTO answer_cache (agent_id, key, fingerprint, reply, hits, created_at) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT (agent_id, key) DO UPDATE SET fingerprint = excluded.fingerprint, reply = excluded.reply, hits = 0, created_at = excluded.created_at")
    .run(agentId, key, fingerprint, JSON.stringify(answer), now());
  await db()
    .prepare("DELETE FROM answer_cache WHERE agent_id = ? AND key NOT IN (SELECT key FROM answer_cache WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?)")
    .run(agentId, agentId, KEEP_PER_AGENT);
}
