// Storing agents, their knowledge and their conversations (Postgres, src/lib/db.ts). Passages with their vectors are
// kept in memory per agent once read, and dropped whenever that agent's knowledge changes.

import { createHash, randomBytes } from "node:crypto";
import { type Agent, type AgentConfig, type AgentConfigChange, type Industry, type Source, type SourceKind, type SourceStatus, defaultAgentConfig, mergeConfig } from "@/core/agents";
import { db, fromBlob, system, toBlob, transaction } from "@/lib/db";
import { currentTenant } from "@/lib/tenant";
import { forgetLessons } from "./memory";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
const json = <T>(text: unknown, fallback: T): T => {
  try {
    return typeof text === "string" ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
};

// ── Agents ──────────────────────────────────────────────────────────────────────────────────────────────────────

type AgentRow = { id: string; workspace_id: string; name: string; enabled: number; config: string; created_at: string; updated_at: string };

function toAgent(row: AgentRow): Agent {
  const saved = json<Partial<AgentConfig>>(row.config, {});
  const defaults = defaultAgentConfig(row.name, saved.industry);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    enabled: Boolean(row.enabled),
    config: mergeConfig(defaults, saved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAgent(workspaceId: string, name: string, options: { industry?: Industry; config?: AgentConfigChange } = {}): Promise<Agent> {
  const at = now();
  const defaults = defaultAgentConfig(name, options.industry);
  const config = mergeConfig(defaults, options.config);
  const agentId = id("agt");
  await db()
    .prepare("INSERT INTO agents (id, workspace_id, name, enabled, config, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)")
    .run(agentId, workspaceId, name, JSON.stringify(config), at, at);
  return (await getAgent(agentId))!;
}

export async function getAgent(agentId: string): Promise<Agent | undefined> {
  const row = await db().prepare("SELECT * FROM agents WHERE id = ?").get<AgentRow>(agentId);
  return row ? toAgent(row) : undefined;
}

/** Which business an agent belongs to, before one is known (a visitor's chat, a message from a messaging app). */
export async function agentWorkspace(agentId: string): Promise<string | undefined> {
  return (await system().prepare("SELECT workspace_id FROM agents WHERE id = ?").get<{ workspace_id: string }>(agentId))?.workspace_id;
}

/** Which business a conversation belongs to, before one is known. */
export async function conversationWorkspace(conversationId: string): Promise<string | undefined> {
  return (await system().prepare("SELECT workspace_id FROM conversations WHERE id = ?").get<{ workspace_id: string }>(conversationId))?.workspace_id;
}

export async function listAgents(workspaceId: string): Promise<Agent[]> {
  return (await db().prepare("SELECT * FROM agents WHERE workspace_id = ? ORDER BY updated_at DESC").all<AgentRow>(workspaceId)).map(toAgent);
}

export async function updateAgent(agentId: string, change: { name?: string; enabled?: boolean; config?: AgentConfigChange }): Promise<Agent | undefined> {
  const agent = await getAgent(agentId);
  if (!agent) return undefined;
  const config = mergeConfig(agent.config, change.config);
  await db()
    .prepare("UPDATE agents SET name = ?, enabled = ?, config = ?, updated_at = ? WHERE id = ?")
    .run(change.name ?? agent.name, (change.enabled ?? agent.enabled) ? 1 : 0, JSON.stringify(config), now(), agentId);
  return getAgent(agentId);
}

export interface AgentSummary extends Agent {
  sources: number;
  /** Sources trained and searchable. */
  readySources: number;
  conversations: number;
}

/** A workspace's agents with how much they know and how many chats they've had, for the agents list. */
export async function agentSummaries(workspaceId: string): Promise<AgentSummary[]> {
  const counts = new Map(
    (await db()
      .prepare(
        `SELECT a.id,
                (SELECT COUNT(*) FROM sources s WHERE s.agent_id = a.id) AS sources,
                (SELECT COUNT(*) FROM sources s WHERE s.agent_id = a.id AND s.status = 'ready') AS ready,
                (SELECT COUNT(*) FROM conversations c WHERE c.agent_id = a.id AND c.channel NOT IN ('playground', 'test')) AS conversations
         FROM agents a WHERE a.workspace_id = ?`,
      )
      .all<{ id: string; sources: number; ready: number; conversations: number }>(workspaceId)).map((r) => [r.id, r]),
  );
  return (await listAgents(workspaceId)).map((agent) => {
    const c = counts.get(agent.id);
    return { ...agent, sources: Number(c?.sources ?? 0), readySources: Number(c?.ready ?? 0), conversations: Number(c?.conversations ?? 0) };
  });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await db().prepare("DELETE FROM agents WHERE id = ?").run(agentId);
  await forgetChunks(agentId);
  await forgetLessons(agentId);
}

// ── Sources ─────────────────────────────────────────────────────────────────────────────────────────────────────

type SourceRow = {
  id: string;
  agent_id: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  status: SourceStatus;
  error: string | null;
  chars: number;
  created_at: string;
  updated_at: string;
};

const toSource = (r: SourceRow): Source => ({
  id: r.id,
  agentId: r.agent_id,
  kind: r.kind,
  title: r.title,
  ...(r.url ? { url: r.url } : {}),
  status: r.status,
  ...(r.error ? { error: r.error } : {}),
  chars: r.chars,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Adds a source with its text, waiting to be trained. */
export async function addSource(agentId: string, source: { kind: SourceKind; title: string; url?: string; content: string }): Promise<Source> {
  const at = now();
  const row = {
    id: id("src"),
    agentId,
    kind: source.kind,
    title: source.title.slice(0, 300),
    url: source.url,
    content: source.content,
  };
  await db()
    .prepare(
      "INSERT INTO sources (id, agent_id, kind, title, url, status, chars, content, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
    )
    .run(row.id, agentId, row.kind, row.title, row.url ?? null, row.content.length, row.content, contentHash(row.content), at, at);
  return (await getSource(row.id))!;
}

export async function getSource(sourceId: string): Promise<Source | undefined> {
  const row = await db().prepare("SELECT id, agent_id, kind, title, url, status, error, chars, created_at, updated_at FROM sources WHERE id = ?").get<SourceRow>(sourceId);
  return row ? toSource(row) : undefined;
}

export async function sourceContent(sourceId: string): Promise<string> {
  return (await db().prepare("SELECT content FROM sources WHERE id = ?").get<{ content?: string }>(sourceId))?.content ?? "";
}

export async function listSources(agentId: string): Promise<Source[]> {
  return (await db()
    .prepare("SELECT id, agent_id, kind, title, url, status, error, chars, created_at, updated_at FROM sources WHERE agent_id = ? ORDER BY created_at")
    .all<SourceRow>(agentId)).map(toSource);
}

/** How much an agent knows: its sources by kind, how many are ready or still learning, and how much text. */
export async function sourceSummary(agentId: string): Promise<{ total: number; ready: number; learning: number; chars: number; byKind: Record<SourceKind, number> }> {
  const rows = await db()
    .prepare("SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(chars), 0) AS chars FROM sources WHERE agent_id = ? GROUP BY kind, status")
    .all<{ kind: SourceKind; status: SourceStatus; n: number; chars: number }>(agentId);
  const byKind: Record<SourceKind, number> = { website: 0, file: 0, text: 0, qa: 0 };
  let total = 0, ready = 0, learning = 0, chars = 0;
  for (const r of rows) {
    const n = Number(r.n);
    byKind[r.kind] += n;
    total += n;
    chars += Number(r.chars);
    if (r.status === "ready") ready += n;
    else if (r.status === "pending" || r.status === "training") learning += n;
  }
  return { total, ready, learning, chars, byKind };
}

/** The source an agent already has for a web page, so reading the site again updates it instead of adding a copy. */
export async function findSourceByUrl(agentId: string, url: string): Promise<Source | undefined> {
  const row = await db()
    .prepare("SELECT id, agent_id, kind, title, url, status, error, chars, created_at, updated_at FROM sources WHERE agent_id = ? AND url = ?")
    .get<SourceRow>(agentId, url);
  return row ? toSource(row) : undefined;
}

/** New text for a source. Returns whether it changed (and so needs training again). */
export async function updateSourceContent(sourceId: string, change: { title?: string; content: string }): Promise<boolean> {
  const before = await db().prepare("SELECT title, content_hash FROM sources WHERE id = ?").get<{ title: string; content_hash: string }>(sourceId);
  if (!before) return false;
  const title = (change.title ?? before.title).slice(0, 300);
  const hash = contentHash(change.content);
  if (hash === before.content_hash && title === before.title) return false;
  await db()
    .prepare("UPDATE sources SET title = ?, content = ?, content_hash = ?, chars = ?, status = 'pending', error = NULL, updated_at = ? WHERE id = ?")
    .run(title, change.content, hash, change.content.length, now(), sourceId);
  return true;
}

export async function setSourceStatus(sourceId: string, status: SourceStatus, error?: string): Promise<void> {
  await db().prepare("UPDATE sources SET status = ?, error = ?, updated_at = ? WHERE id = ?").run(status, error ?? null, now(), sourceId);
}

export async function deleteSource(sourceId: string): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  await db().prepare("DELETE FROM sources WHERE id = ?").run(sourceId);
  await forgetChunks(source.agentId);
}

// ── Chunks ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface StoredChunk {
  id: number;
  sourceId: string;
  title: string;
  url?: string;
  section?: string;
  text: string;
  embedding?: Float32Array;
}

/** Replaces a source's chunks (and marks it ready) in one transaction. */
export async function replaceChunks(sourceId: string, chunks: { text: string; section?: string; embedding?: number[] }[]): Promise<void> {
  const source = await getSource(sourceId);
  if (!source) return;
  await transaction(async (database) => {
    await database.prepare("DELETE FROM chunks WHERE source_id = ?").run(sourceId);
    const insert = database.prepare("INSERT INTO chunks (agent_id, source_id, ord, text, section, embedding) VALUES (?, ?, ?, ?, ?, ?)");
    for (const [i, c] of chunks.entries()) await insert.run(source.agentId, sourceId, i, c.text, c.section ?? null, c.embedding ? toBlob(c.embedding) : null);
    await database.prepare("UPDATE sources SET status = 'ready', error = NULL, updated_at = ? WHERE id = ?").run(now(), sourceId);
  });
  await forgetChunks(source.agentId);
}

const globalChunks = globalThis as unknown as { __keelChunks?: Map<string, StoredChunk[]> };
const chunkCache = (globalChunks.__keelChunks ??= new Map());

/** The cache key: the business too, so what's kept in memory is never handed to another business. */
const chunkKey = async (agentId: string) => `${(await currentTenant()) ?? ""}/${agentId}`;

async function forgetChunks(agentId: string) {
  chunkCache.delete(await chunkKey(agentId));
}

/** Every searchable chunk of an agent's ready sources, from memory after the first read. */
export async function agentChunks(agentId: string): Promise<StoredChunk[]> {
  const key = await chunkKey(agentId);
  const cached = chunkCache.get(key);
  if (cached) return cached;
  const rows = await db()
    .prepare(
      `SELECT c.id, c.source_id, c.text, c.section, c.embedding, s.title, s.url
       FROM chunks c JOIN sources s ON s.id = c.source_id
       WHERE c.agent_id = ? AND s.status = 'ready' ORDER BY c.source_id, c.ord`,
    )
    .all<{ id: number; source_id: string; text: string; section: string | null; embedding: Uint8Array | null; title: string; url: string | null }>(agentId);
  const chunks = rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    ...(r.url ? { url: r.url } : {}),
    ...(r.section ? { section: r.section } : {}),
    text: r.text,
    ...(r.embedding ? { embedding: fromBlob(r.embedding) } : {}),
  }));
  chunkCache.set(key, chunks);
  return chunks;
}

// ── Conversations ───────────────────────────────────────────────────────────────────────────────────────────────

export type Channel = "playground" | "widget" | "share" | "api" | "test" | MessagingChannel;
/** Conversations that come in from a messaging app or a support tool the business connected (src/platform/integrations). */
export type MessagingChannel = "whatsapp" | "messenger" | "instagram" | "telegram";
export const MESSAGING_CHANNELS: MessagingChannel[] = ["whatsapp", "messenger", "instagram", "telegram"];
export type MessageRole = "user" | "assistant" | "human" | "system";

export interface Message {
  id: number;
  role: MessageRole;
  content: string;
  meta: Record<string, unknown>;
  costUsd: number;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  agentId: string;
  channel: Channel;
  status: "open" | "handed_off" | "closed" | "paused";
  contactId?: string;
  meta: Record<string, unknown>;
  startedAt: string;
  lastAt: string;
  messages: number;
  preview: string;
}

export async function startConversation(agentId: string, channel: Channel, meta: Record<string, unknown> = {}): Promise<string> {
  const conversationId = id("conv");
  const at = now();
  await db()
    .prepare("INSERT INTO conversations (id, agent_id, channel, status, meta, started_at, last_at) VALUES (?, ?, ?, 'open', ?, ?, ?)")
    .run(conversationId, agentId, channel, JSON.stringify(meta), at, at);
  return conversationId;
}

export async function conversationAgent(conversationId: string): Promise<string | undefined> {
  return (await db().prepare("SELECT agent_id FROM conversations WHERE id = ?").get<{ agent_id?: string }>(conversationId))?.agent_id;
}

export async function addMessage(conversationId: string, message: { role: MessageRole; content: string; meta?: Record<string, unknown>; costUsd?: number }): Promise<Message> {
  const at = now();
  const row = await db()
    .prepare("INSERT INTO messages (conversation_id, role, content, meta, cost_usd, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .get<{ id: number }>(conversationId, message.role, message.content, JSON.stringify(message.meta ?? {}), message.costUsd ?? 0, at);
  await db().prepare("UPDATE conversations SET last_at = ? WHERE id = ?").run(at, conversationId);
  return { id: row!.id, role: message.role, content: message.content, meta: message.meta ?? {}, costUsd: message.costUsd ?? 0, createdAt: at };
}

export async function conversationMessages(conversationId: string): Promise<Message[]> {
  return (await db().prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id").all<{
    id: number;
    role: MessageRole;
    content: string;
    meta: string;
    cost_usd: number;
    created_at: string;
  }>(conversationId)).map((r) => ({ id: r.id, role: r.role, content: r.content, meta: json(r.meta, {}), costUsd: r.cost_usd, createdAt: r.created_at }));
}

export interface AgentActivity {
  days: { date: string; visitors: number; tests: number }[];
  conversations: number;
  visitorConversations: number;
  messages: number;
  costUsd: number;
}

/** An agent's conversations per day and its totals over the last `days` days, for its overview. */
export async function agentActivity(agentId: string, days = 14): Promise<AgentActivity> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();
  const perDay = await db()
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day, COUNT(*) FILTER (WHERE channel NOT IN ('playground', 'test')) AS visitors, COUNT(*) FILTER (WHERE channel = 'playground') AS tests
       FROM conversations WHERE agent_id = ? AND started_at >= ? GROUP BY day`,
    )
    .all<{ day: string; visitors: number; tests: number }>(agentId, sinceIso);
  const byDay = new Map(perDay.map((d) => [d.day, d]));
  const totals = (await db()
    .prepare(
      `SELECT COUNT(*) AS messages, COALESCE(SUM(m.cost_usd), 0) AS cost
       FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.agent_id = ? AND m.created_at >= ?`,
    )
    .get<{ messages: number; cost: number }>(agentId, sinceIso))!;
  const list = Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const d = byDay.get(date);
    return { date, visitors: Number(d?.visitors ?? 0), tests: Number(d?.tests ?? 0) };
  });
  return {
    days: list,
    conversations: list.reduce((n, d) => n + d.visitors + d.tests, 0),
    visitorConversations: list.reduce((n, d) => n + d.visitors, 0),
    messages: Number(totals.messages),
    costUsd: Number(totals.cost),
  };
}

export async function listConversations(agentId: string, limit = 100, channels?: Channel[]): Promise<ConversationSummary[]> {
  const only = channels?.length ? `AND c.channel IN (${channels.map(() => "?").join(", ")})` : "AND c.channel != 'test'";
  return (await db()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS count,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY id LIMIT 1) AS first
       FROM conversations c WHERE c.agent_id = ? ${only} ORDER BY c.last_at DESC LIMIT ?`,
    )
    .all<{
    id: string;
    agent_id: string;
    channel: Channel;
    status: ConversationSummary["status"];
    contact_id: string | null;
    meta: string;
    started_at: string;
    last_at: string;
    count: number;
    first: string | null;
  }>(agentId, ...(channels ?? []), limit)).map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    channel: r.channel,
    status: r.status,
    ...(r.contact_id ? { contactId: r.contact_id } : {}),
    meta: json(r.meta, {}),
    startedAt: r.started_at,
    lastAt: r.last_at,
    messages: Number(r.count),
    preview: (r.first ?? "").slice(0, 160),
  }));
}

/** One conversation's summary, for its details. */
export async function conversationSummary(conversationId: string): Promise<ConversationSummary | undefined> {
  const r = await db()
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS count,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY id LIMIT 1) AS first
       FROM conversations c WHERE c.id = ?`,
    )
    .get<{ id: string; agent_id: string; channel: Channel; status: ConversationSummary["status"]; contact_id: string | null; meta: string; started_at: string; last_at: string; count: number; first: string | null }>(conversationId);
  if (!r) return undefined;
  return {
    id: r.id,
    agentId: r.agent_id,
    channel: r.channel,
    status: r.status,
    ...(r.contact_id ? { contactId: r.contact_id } : {}),
    meta: json(r.meta, {}),
    startedAt: r.started_at,
    lastAt: r.last_at,
    messages: Number(r.count),
    preview: (r.first ?? "").slice(0, 160),
  };
}

/** Deletes every conversation of an agent (Settings › Danger zone). */
export async function deleteConversations(agentId: string): Promise<number> {
  return (await db().prepare("DELETE FROM conversations WHERE agent_id = ?").run(agentId)).changes;
}

/** The agent's conversations with at least one answer less sure than `below`. */
export async function lowConfidenceConversations(agentId: string, below = 0.5): Promise<Set<string>> {
  const rows = await db()
    .prepare(
      `SELECT DISTINCT m.conversation_id AS id FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.agent_id = ? AND m.role = 'assistant' AND (m.meta::jsonb->>'confidence')::float8 < ?`,
    )
    .all<{ id: string }>(agentId, below);
  return new Set(rows.map((r) => r.id));
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await db().prepare("DELETE FROM conversations WHERE id = ?").run(conversationId);
}

/** Resumes a paused conversation (the agent replies again) or closes one. */
export async function setConversationStatus(conversationId: string, status: "open" | "closed"): Promise<void> {
  await db().prepare("UPDATE conversations SET status = ? WHERE id = ?").run(status, conversationId);
}
