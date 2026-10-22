// Suggestions: where the agent's knowledge lets customers down, so the builder can fix it. Gaps are questions visitors
// asked that nothing answered (the agent fell back, or answered with low confidence), grouped by question. Conflicts
// are passages from different sources that say different things about the same subject (a strong model confirms
// each). Each suggestion has a severity and, for a gap, a one-click fix: write the answer as a Q&A.

import { createHash } from "node:crypto";
import { z } from "zod";
import { contentWords } from "@/core/text";
import { db } from "@/lib/db";
import { cosine } from "@/lib/embeddings";
import { chatJson } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { json, newId, now } from "@/lib/rows";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import { agentChunks, getAgent } from "./store";
import { meteredForAgent } from "./usage";

export type SuggestionKind = "gap" | "conflict";

export interface Suggestion {
  id: string;
  agentId: string;
  kind: SuggestionKind;
  /** 3: critical, 2: important, 1: minor. */
  severity: 1 | 2 | 3;
  title: string;
  detail: { questions?: string[]; conversationIds?: string[]; passages?: { title: string; text: string }[]; explanation?: string; key: string };
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
}

type Row = { id: string; agent_id: string; kind: SuggestionKind; severity: number; title: string; detail: string; status: Suggestion["status"]; created_at: string; updated_at: string };

const toSuggestion = (r: Row): Suggestion => ({
  id: r.id,
  agentId: r.agent_id,
  kind: r.kind,
  severity: Math.min(3, Math.max(1, r.severity)) as Suggestion["severity"],
  title: r.title,
  detail: json(r.detail, { key: "" }),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listSuggestions(agentId: string, status: Suggestion["status"] | "all" = "open"): Promise<Suggestion[]> {
  const where = status === "all" ? "" : "AND status = ?";
  return ((await db()
    .prepare(`SELECT * FROM suggestions WHERE agent_id = ? ${where} ORDER BY severity DESC, updated_at DESC`)
    .all(...(status === "all" ? [agentId] : [agentId, status]))) as Row[]).map(toSuggestion);
}

export async function getSuggestion(id: string): Promise<Suggestion | undefined> {
  const row = (await db().prepare("SELECT * FROM suggestions WHERE id = ?").get(id)) as Row | undefined;
  return row ? toSuggestion(row) : undefined;
}

export async function setSuggestionStatus(id: string, status: Suggestion["status"]): Promise<void> {
  await db().prepare("UPDATE suggestions SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), id);
}

/** Adds a suggestion, or updates the open one with the same key; a dismissed one stays dismissed. */
async function upsert(agentId: string, s: Omit<Suggestion, "id" | "agentId" | "status" | "createdAt" | "updatedAt">): Promise<void> {
  const rows = (await db().prepare("SELECT * FROM suggestions WHERE agent_id = ? AND kind = ?").all(agentId, s.kind)) as Row[];
  const existing = rows.map(toSuggestion).find((x) => x.detail.key === s.detail.key);
  if (existing?.status === "dismissed" || existing?.status === "resolved") return;
  if (existing) {
    await db().prepare("UPDATE suggestions SET severity = ?, title = ?, detail = ?, updated_at = ? WHERE id = ?").run(s.severity, s.title, JSON.stringify(s.detail), now(), existing.id);
    return;
  }
  await db()
    .prepare("INSERT INTO suggestions (id, agent_id, kind, severity, title, detail, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)")
    .run(newId("sug"), agentId, s.kind, s.severity, s.title, JSON.stringify(s.detail), now(), now());
}

const keyOf = (text: string) => createHash("sha1").update([...contentWords(text)].sort().join(" ")).digest("hex").slice(0, 12);

/** Questions the agent couldn't answer well, grouped by their main words. No model call. */
export async function findGaps(agentId: string): Promise<number> {
  const agent = await getAgent(agentId);
  if (!agent) return 0;
  const rows = (await db()
    .prepare(
      `SELECT a.conversation_id, a.content, (a.meta::jsonb->>'confidence')::float8 AS confidence,
              (SELECT content FROM messages u WHERE u.conversation_id = a.conversation_id AND u.role = 'user' AND u.id < a.id ORDER BY u.id DESC LIMIT 1) AS question
       FROM messages a JOIN conversations c ON c.id = a.conversation_id
       WHERE c.agent_id = ? AND c.channel != 'test' AND a.role = 'assistant' AND a.created_at >= ?`,
    )
    .all(agentId, new Date(Date.now() - 30 * 86_400_000).toISOString())) as { conversation_id: string; content: string; confidence: number | null; question: string | null }[];
  const groups = new Map<string, { questions: string[]; conversations: Set<string> }>();
  for (const r of rows) {
    const fellBack = r.content.trim() === agent.config.fallback.trim();
    if (!r.question || (!fellBack && (r.confidence ?? 1) >= 0.35)) continue;
    const key = keyOf(r.question);
    const g = groups.get(key) ?? { questions: [], conversations: new Set() };
    if (!g.questions.includes(r.question)) g.questions.push(r.question);
    g.conversations.add(r.conversation_id);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    const times = g.conversations.size;
    await upsert(agentId, {
      kind: "gap",
      severity: times >= 5 ? 3 : times >= 2 ? 2 : 1,
      title: `Visitors ask "${g.questions[0].slice(0, 120)}" and nothing answers it`,
      detail: { key, questions: g.questions.slice(0, 10), conversationIds: [...g.conversations].slice(0, 20) },
    });
  }
  return groups.size;
}

const Conflict = z.object({ conflict: z.boolean(), explanation: z.string().max(400) });
const SCHEMA = "knowledge_conflict";
const numbersIn = (text: string) => new Set(text.match(/\$?\d+(?:[.,]\d+)?%?/g) ?? []);

/** Pairs of passages from different sources about the same thing with different numbers, confirmed by a model. */
export function findConflicts(agentId: string, maxChecks = 12): Promise<number> {
  return meteredForAgent(agentId, "analysis", () => findConflictsNow(agentId, maxChecks));
}

async function findConflictsNow(agentId: string, maxChecks = 12): Promise<number> {
  const agent = await getAgent(agentId);
  if (!agent) return 0;
  const chunks = await agentChunks(agentId);
  const candidates: { a: number; b: number; similarity: number }[] = [];
  for (let i = 0; i < chunks.length; i++)
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];
      if (a.sourceId === b.sourceId) continue;
      const na = numbersIn(a.text);
      const nb = numbersIn(b.text);
      if (!na.size || !nb.size || [...na].every((n) => nb.has(n))) continue;
      const similarity = a.embedding && b.embedding ? cosine(a.embedding, b.embedding) : [...contentWords(a.text)].filter((w) => contentWords(b.text).has(w)).length / 20;
      if (similarity >= 0.45) candidates.push({ a: i, b: j, similarity });
    }
  candidates.sort((x, y) => y.similarity - x.similarity);
  let found = 0;
  for (const c of candidates.slice(0, maxChecks)) {
    const a = chunks[c.a];
    const b = chunks[c.b];
    const result = await chatJson(
      ROLE_MODEL.analyst,
      [
        {
          role: "system",
          content: [
            "Two passages from a business's own documents. Do they contradict each other about the same thing (a price, a time limit, a policy), so a customer could get two different answers? Different topics, or one being more detailed, is not a contradiction.",
            REFERENCE_RULE,
            reference(`passage from ${a.title}`, a.text.slice(0, 1500)),
            reference(`passage from ${b.title}`, b.text.slice(0, 1500)),
          ].join("\n"),
        },
        { role: "user", content: "Your answer." },
      ],
      Conflict,
      SCHEMA,
      { temperature: 0, maxTokens: 300 },
    );
    if (!result.data.conflict) continue;
    found++;
    await upsert(agentId, {
      kind: "conflict",
      severity: 3,
      title: `"${a.title}" and "${b.title}" say different things`,
      detail: { key: `${a.id}-${b.id}`, explanation: result.data.explanation, passages: [{ title: a.title, text: a.text.slice(0, 600) }, { title: b.title, text: b.text.slice(0, 600) }] },
    });
  }
  return found;
}
