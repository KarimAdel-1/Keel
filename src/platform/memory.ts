// Long-term memory for Keel's own agents, as a LangGraph Store (BaseStore) kept in Keel's database: what LangGraph
// graphs use to remember across runs. Items live in namespaces (["agent", <id>, "lessons"]) under keys; a search can
// filter by fields and rank by a query (keywords, BM25: instant and free, no model call).
//
// Memory is shared between Keel's agents, each agent's in its own namespaces:
//
// | Namespace                  | Written by                                   | Read by                                    |
// | agent/<id>/lessons         | the improvement agent (causes, fixes tried,  | the Diagnostician and the Fixer (before    |
// |                            | what happened), the builder's decisions      | each round), the Analyst                   |
// |                            | (applied, discarded, undone)                 |                                            |
// | agent/<id>/notes           | the Copilot, when the builder states a       | the Diagnostician, the Fixer, the Analyst  |
// |                            | lasting preference                           |                                            |
//
// Kept apart on purpose: the test judges read no memory (a verdict must depend only on the conversation), and
// customer agents read none (what they say changes only through settings the builder approves).
//
// Shared memory can contradict itself, so every item has one key per subject: a newer lesson about the same fix or
// test, or a newer note on the same subject, replaces the old one instead of piling up beside it. Writes are single
// Postgres statements, so agents writing at once never see half an update. Each business's memory is its own (row-level security). Lessons hold for the agent as it was when
// they were learned (agentState); the builder's decisions and notes hold until changed or forgotten. Each agent keeps
// its last MAX_LESSONS lessons and MAX_NOTES notes.

import { createHash } from "node:crypto";
import { BaseStore, type GetOperation, type Item, type ListNamespacesOperation, type Operation, type OperationResults, type PutOperation, type SearchOperation } from "@langchain/langgraph";
import type { Patch } from "@/core/patches";
import { bm25, terms } from "@/core/search";
import { db } from "@/lib/db";
import { json, now } from "@/lib/rows";

const SEP = "/";

const pathOf = (namespace: string[]) => {
  for (const label of namespace) if (!label || label.includes(SEP)) throw new Error(`A memory namespace label can't be empty or contain "${SEP}".`);
  return namespace.join(SEP);
};

type Row = { namespace: string; key: string; value: string; created_at: string; updated_at: string };
/** An item found by a search, with its match score when the search had a query. */
type SearchItem = Item & { score?: number };

const toItem = (r: Row): Item => ({ namespace: r.namespace.split(SEP), key: r.key, value: json<Record<string, unknown>>(r.value, {}), createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) });

/** Whether a stored value passes a search filter: exact values, or $eq, $ne, $gt, $gte, $lt, $lte. */
function passes(value: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, condition]) => {
    const v = value[field] as number | string;
    if (!condition || typeof condition !== "object" || Array.isArray(condition)) return v === condition;
    return Object.entries(condition as Record<string, number | string>).every(([op, x]) => {
      if (op === "$eq") return v === x;
      if (op === "$ne") return v !== x;
      if (op === "$gt") return v > x;
      if (op === "$gte") return v >= x;
      if (op === "$lt") return v < x;
      if (op === "$lte") return v <= x;
      return false;
    });
  });
}

/** The text a search ranks an item by: its `text` field when it has one, else the whole value. */
const searchText = (value: Record<string, unknown>) => (typeof value.text === "string" ? value.text : JSON.stringify(value));

/** A LangGraph Store in Keel's database. */
export class KeelStore extends BaseStore {
  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: unknown[] = [];
    for (const op of operations) results.push(await this.run(op));
    return results as OperationResults<Op>;
  }

  private run(op: Operation): Promise<unknown> {
    if ("namespacePrefix" in op) return this.find(op);
    if ("value" in op) return this.write(op);
    if ("key" in op) return this.read(op);
    return this.namespaces(op);
  }

  private async read(op: GetOperation): Promise<Item | null> {
    const row = await db().prepare("SELECT * FROM memories WHERE namespace = ? AND key = ?").get<Row>(pathOf(op.namespace), op.key);
    return row ? toItem(row) : null;
  }

  private write(op: PutOperation): Promise<void> {
    return this.putNow(op.namespace, op.key, op.value);
  }

  /** A put (or, with null, a delete) done right away: for writes outside a graph. */
  async putNow(namespace: string[], key: string, value: Record<string, unknown> | null): Promise<void> {
    const path = pathOf(namespace);
    if (value === null) {
      await db().prepare("DELETE FROM memories WHERE namespace = ? AND key = ?").run(path, key);
      return;
    }
    const at = now();
    await db()
      .prepare("INSERT INTO memories (namespace, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (workspace_id, namespace, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
      .run(path, key, JSON.stringify(value), at, at);
  }

  private async find(op: SearchOperation): Promise<SearchItem[]> {
    const prefix = op.namespacePrefix.length ? pathOf(op.namespacePrefix) : "";
    const rows = prefix
      ? await db().prepare("SELECT * FROM memories WHERE namespace = ? OR namespace LIKE ? ORDER BY updated_at DESC, seq DESC").all<Row>(prefix, `${prefix}${SEP}%`)
      : await db().prepare("SELECT * FROM memories ORDER BY updated_at DESC, seq DESC").all<Row>();
    const items: SearchItem[] = rows.map(toItem).filter((item) => passes(item.value, op.filter));
    if (op.query?.trim()) {
      const scores = bm25(op.query, items.map((item) => terms(searchText(item.value))));
      items.forEach((item, i) => (item.score = scores[i]));
      // Best match first; equal scores keep the newest first.
      items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }
    const offset = op.offset ?? 0;
    return items.slice(offset, offset + (op.limit ?? 10));
  }

  private async namespaces(op: ListNamespacesOperation): Promise<string[][]> {
    const fits = (namespace: string[], path: string[], at: "prefix" | "suffix") => {
      if (path.length > namespace.length) return false;
      const part = at === "prefix" ? namespace.slice(0, path.length) : namespace.slice(namespace.length - path.length);
      return path.every((label, i) => label === "*" || label === part[i]);
    };
    const all = (await db().prepare("SELECT DISTINCT namespace FROM memories ORDER BY namespace").all<{ namespace: string }>())
      .map((r) => r.namespace.split(SEP))
      .filter((ns) => (op.matchConditions ?? []).every((c) => fits(ns, c.path as string[], c.matchType)))
      .map((ns) => (op.maxDepth ? ns.slice(0, op.maxDepth) : ns));
    const unique = [...new Map(all.map((ns) => [ns.join(SEP), ns])).values()];
    return unique.slice(op.offset, op.offset + op.limit);
  }
}

const shared = globalThis as unknown as { __keelStore?: KeelStore };

/** Keel's store, shared by every graph. */
export const memoryStore = (): KeelStore => (shared.__keelStore ??= new KeelStore());

// ── Lessons: what the improvement agent learns about one agent ──────────────────────────────────────────────────

export type LessonKind = "kept" | "rejected" | "cause" | "applied" | "discarded" | "undone" | "note";

export interface Lesson {
  kind: LessonKind;
  /** One line, as the agents read it (and as searches rank it). */
  text: string;
  /** The tests it's about. */
  tests: string[];
  /** The fix it's about, as a fingerprint of its edits (fixKey), to recognize the same fix again. */
  fix?: string;
  /** The agent it was learned on (versions.ts agentFingerprint): a result holds for that agent as it was. */
  agentState?: string;
  /** For a fix that didn't work: it broke a test that passed (the strongest reason not to try it again). */
  broke?: boolean;
  session?: string;
  at: string;
}

/** Each agent keeps its newest lessons, up to this many. */
export const MAX_LESSONS = 200;

export const lessonSpace = (agentId: string) => ["agent", agentId, "lessons"];

/** A fix's fingerprint: its edits without the reasons given for them, so the same edits are recognized again. */
export function fixKey(patches: Patch[]): string {
  const stable = patches.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "why").map(([k, v]) => [k, typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v])));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 16);
}

/** Forgets an agent's oldest lessons past MAX_LESSONS. */
async function prune(agentId: string): Promise<void> {
  const namespace = pathOf(lessonSpace(agentId));
  await db()
    .prepare("DELETE FROM memories WHERE namespace = ? AND key NOT IN (SELECT key FROM memories WHERE namespace = ? ORDER BY updated_at DESC, seq DESC LIMIT ?)")
    .run(namespace, namespace, MAX_LESSONS);
}

/** Keeps a lesson about an agent from inside a graph (the same key replaces it). */
export async function remember(store: BaseStore, agentId: string, key: string, lesson: Omit<Lesson, "at">): Promise<void> {
  await store.put(lessonSpace(agentId), key, { ...lesson, at: now() });
  await prune(agentId);
}

/** Keeps the builder's decision about a fix right away (applying, discarding or undoing happens outside a graph). */
export async function rememberDecision(agentId: string, key: string, lesson: Omit<Lesson, "at">): Promise<void> {
  await memoryStore().putNow(lessonSpace(agentId), key, { ...lesson, at: now() });
  await prune(agentId);
}

/** Forgets one lesson (a fix that was undone is back after a later restore). */
export async function forgetLesson(agentId: string, key: string): Promise<void> {
  await memoryStore().putNow(lessonSpace(agentId), key, null);
}

/**
 * The lessons that bear on this work: those about these tests (ranked by the query), then the builder's decisions,
 * then other recent ones, at most `limit`.
 */
export async function recall(store: BaseStore, agentId: string, input: { tests: string[]; query: string; limit?: number }): Promise<Lesson[]> {
  const found = (await store.search(lessonSpace(agentId), { query: input.query, limit: MAX_LESSONS })).map((i) => i.value as Lesson);
  const about = found.filter((l) => l.tests.some((t) => input.tests.includes(t)));
  const decisions = found.filter((l) => !about.includes(l) && ["applied", "discarded", "undone"].includes(l.kind));
  const rest = found.filter((l) => !about.includes(l) && !decisions.includes(l));
  return [...about, ...decisions, ...rest].slice(0, input.limit ?? 12);
}

/** All the lessons a fix has, newest first. */
export async function lessonsAboutFix(store: BaseStore, agentId: string, fix: string): Promise<Lesson[]> {
  return (await store.search(lessonSpace(agentId), { filter: { fix }, limit: MAX_LESSONS })).map((i) => i.value as Lesson);
}

/** Lessons as lines for a prompt or a page: newest first, dated. */
export const lessonLines = (lessons: Lesson[]) => lessons.map((l) => `${l.at.slice(0, 10)} · ${l.text}`);

/** The newest lessons about an agent, read directly (for reports that aren't in a graph). */
export async function recentLessons(agentId: string, limit = 8): Promise<Lesson[]> {
  return (await db().prepare("SELECT value FROM memories WHERE namespace = ? ORDER BY updated_at DESC, seq DESC LIMIT ?").all<{ value: string }>(pathOf(lessonSpace(agentId)), limit)).map((r) => json<Lesson>(r.value, { kind: "cause", text: "", tests: [], at: "" }));
}

// ── Notes: the builder's lasting preferences about how Keel works on an agent ──────────────────────────────────────

export const noteSpace = (agentId: string) => ["agent", agentId, "notes"];

/** Each agent keeps its newest notes, up to this many. */
export const MAX_NOTES = 20;

const subjectKey = (subject: string) => `note:${subject.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "general"}`;

/**
 * Keeps one of the builder's preferences (e.g. "never change the agent's tone"). A note on the same subject replaces
 * the last one, so the newest word on a subject is the one every agent follows.
 */
export async function rememberNote(store: BaseStore, agentId: string, subject: string, text: string): Promise<void> {
  await store.put(noteSpace(agentId), subjectKey(subject), { kind: "note", subject, text: text.slice(0, 400), tests: [], at: now() });
  const namespace = pathOf(noteSpace(agentId));
  await db()
    .prepare("DELETE FROM memories WHERE namespace = ? AND key NOT IN (SELECT key FROM memories WHERE namespace = ? ORDER BY updated_at DESC, seq DESC LIMIT ?)")
    .run(namespace, namespace, MAX_NOTES);
}

/** The builder's notes about an agent, newest first. */
export async function notesOf(agentId: string): Promise<Lesson[]> {
  return (await db().prepare("SELECT value FROM memories WHERE namespace = ? ORDER BY updated_at DESC, seq DESC").all<{ value: string }>(pathOf(noteSpace(agentId)))).map((r) => json<Lesson>(r.value, { kind: "note", text: "", tests: [], at: "" }));
}

/** Everything Keel's agents remember about an agent, for the builder to see: notes first, then lessons, newest first. */
export async function memoryOf(agentId: string, limit = 50): Promise<Lesson[]> {
  return [...(await notesOf(agentId)), ...(await recentLessons(agentId, limit))];
}

/** Forgets everything Keel's agents learned about an agent. */
export async function forgetLessons(agentId: string): Promise<number> {
  return (await db().prepare("DELETE FROM memories WHERE namespace = ? OR namespace LIKE ?").run(pathOf(["agent", agentId]), `${pathOf(["agent", agentId])}${SEP}%`)).changes;
}
