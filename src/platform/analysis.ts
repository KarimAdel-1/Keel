// Reading conversations for the analytics: each finished conversation gets a sentiment (positive, neutral, negative)
// and a short topic, written by a fast model and kept with it. Analysis runs when the builder asks for it (it costs
// model time), on conversations that have gone quiet. Then the counts: chats, messages and visitors per day against
// the period before, topics, and sentiment.

import { z } from "zod";
import { db } from "@/lib/db";
import { chatJson } from "@/lib/llm";
import { lenientEnum } from "@/lib/lenient-enum";
import { json } from "@/lib/rows";
import { DATA_RULE, reference } from "@/lib/untrusted";
import { conversationMessages, getAgent } from "./store";
import { meteredForAgent } from "./usage";

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

const Reading = z.object({ sentiment: lenientEnum(SENTIMENTS, { mixed: "neutral", happy: "positive", satisfied: "positive", angry: "negative", frustrated: "negative", unhappy: "negative" }), topic: z.string().max(60) });
const SCHEMA = "conversation_reading";

/** Conversations quiet for this long count as finished. */
const QUIET_MS = 2 * 60_000;

/**
 * What a reading needs of a conversation: the visitor's own words (what they came for, how they felt) and the gist of
 * each agent reply, the start and the end when it's long.
 */
function readingText(messages: { role: string; content: string }[], max = 3000): string {
  const clip = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, "")}…`);
  const lines = messages.map((m) => (m.role === "user" ? `Visitor: ${clip(m.content, 400)}` : `Agent: ${clip(m.content.replace(/\s*\[\d{1,2}\]/g, "").split(/(?<=[.!?])\s/)[0] ?? "", 160)}`));
  const all = lines.join("\n");
  if (all.length <= max) return all;
  const head = lines.slice(0, 2).join("\n");
  return `${head}\n…\n${lines.slice(2).join("\n").slice(-(max - head.length - 3))}`;
}

/** Reads the agent's unread, finished visitor conversations (up to `limit`; not the builder's own tries). Returns how many were read. */
export function analyzeConversations(agentId: string, limit = 50): Promise<number> {
  return meteredForAgent(agentId, "analysis", () => analyzeConversationsNow(agentId, limit));
}

async function analyzeConversationsNow(agentId: string, limit = 50): Promise<number> {
  const agent = await getAgent(agentId);
  if (!agent) return 0;
  const quietSince = new Date(Date.now() - QUIET_MS).toISOString();
  const rows = (await db()
    .prepare(
      `SELECT id, meta FROM conversations WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND last_at < ?
       AND (meta::jsonb->>'sentiment') IS NULL ORDER BY last_at DESC LIMIT ?`,
    )
    .all(agentId, quietSince, limit)) as { id: string; meta: string }[];
  let read = 0;
  for (const row of rows) {
    const messages = (await conversationMessages(row.id)).filter((m) => m.role !== "system");
    if (!messages.some((m) => m.role === "user")) continue;
    const text = readingText(messages);
    const result = await chatJson(
      "lightning",
      [
        {
          role: "system",
          content: [
            "Read this customer conversation. sentiment: how the visitor felt by the end (positive, neutral or negative). topic: what they came for, in 2 to 4 words, in English, like a label (\"Shipping times\", \"Refund request\").",
            DATA_RULE,
            reference("conversation", text),
          ].join("\n"),
        },
        { role: "user", content: "The reading." },
      ],
      Reading,
      SCHEMA,
      { temperature: 0, maxTokens: 60, reasoning: "none" },
    );
    const meta = { ...json<Record<string, unknown>>(row.meta, {}), sentiment: result.data.sentiment, topic: result.data.topic.trim() || "Other" };
    await db().prepare("UPDATE conversations SET meta = ? WHERE id = ?").run(JSON.stringify(meta), row.id);
    read++;
  }
  return read;
}

export interface Period {
  from: string;
  to: string;
}

/** The period of the same length just before. */
export function previousPeriod(p: Period): Period {
  const span = new Date(p.to).getTime() - new Date(p.from).getTime();
  return { from: new Date(new Date(p.from).getTime() - span).toISOString(), to: p.from };
}

export interface ChatsSummary {
  conversations: number;
  messages: number;
  visitors: number;
  handedOver: number;
  previous: { conversations: number; messages: number; visitors: number; handedOver: number };
  days: { date: string; conversations: number; previous: number }[];
}

async function countsIn(agentId: string, p: Period) {
  const row = (await db()
    .prepare(
      `SELECT COUNT(*) AS conversations,
              COUNT(DISTINCT COALESCE(contact_id, id)) AS visitors,
              COUNT(*) FILTER (WHERE status = 'handed_off' OR (meta::jsonb->>'handedOver') = 'true') AS "handedOver",
              (SELECT COUNT(*) FROM messages m JOIN conversations c2 ON c2.id = m.conversation_id WHERE c2.agent_id = ? AND c2.channel NOT IN ('test', 'playground') AND m.created_at >= ? AND m.created_at < ?) AS messages
       FROM conversations WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND started_at >= ? AND started_at < ?`,
    )
    .get(agentId, p.from, p.to, agentId, p.from, p.to)) as { conversations: number; visitors: number; handedOver: number | null; messages: number };
  return { conversations: Number(row.conversations), messages: Number(row.messages), visitors: Number(row.visitors), handedOver: Number(row.handedOver ?? 0) };
}

async function perDay(agentId: string, p: Period): Promise<Map<string, number>> {
  const rows = (await db()
    .prepare("SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS n FROM conversations WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND started_at >= ? AND started_at < ? GROUP BY day")
    .all(agentId, p.from, p.to)) as { day: string; n: number }[];
  return new Map(rows.map((r) => [r.day, Number(r.n)]));
}

/** Visitor conversations, messages and visitors in a period against the period before, with a line per day. */
export async function chatsSummary(agentId: string, p: Period): Promise<ChatsSummary> {
  const prev = previousPeriod(p);
  const current = await perDay(agentId, p);
  const before = await perDay(agentId, prev);
  const span = new Date(p.to).getTime() - new Date(p.from).getTime();
  const days: ChatsSummary["days"] = [];
  for (let t = new Date(p.from).getTime(); t < new Date(p.to).getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const prevDate = new Date(t - span).toISOString().slice(0, 10);
    days.push({ date, conversations: current.get(date) ?? 0, previous: before.get(prevDate) ?? 0 });
  }
  return { ...(await countsIn(agentId, p)), previous: await countsIn(agentId, prev), days };
}

/** How many read conversations had each topic, most common first. */
export async function topicCounts(agentId: string, p: Period): Promise<{ topic: string; count: number; negative: number }[]> {
  return ((await db()
    .prepare(
      `SELECT (meta::jsonb->>'topic') AS topic, COUNT(*) AS count, COUNT(*) FILTER (WHERE (meta::jsonb->>'sentiment') = 'negative') AS negative
       FROM conversations WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND (meta::jsonb->>'topic') IS NOT NULL AND started_at >= ? AND started_at < ?
       GROUP BY topic ORDER BY count DESC LIMIT 30`,
    )
    .all(agentId, p.from, p.to)) as { topic: string; count: number; negative: number }[]).map((r) => ({ topic: r.topic, count: Number(r.count), negative: Number(r.negative) }));
}

/** Sentiment counts in a period and the one before, and per day. */
export async function sentimentSummary(agentId: string, p: Period): Promise<{ totals: Record<Sentiment | "unread", number>; previous: Record<Sentiment | "unread", number>; days: ({ date: string } & Record<Sentiment, number>)[] }> {
  const totalsFor = async (period: Period) => {
    const rows = (await db()
      .prepare(
        `SELECT COALESCE((meta::jsonb->>'sentiment'), 'unread') AS s, COUNT(*) AS n FROM conversations
         WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND started_at >= ? AND started_at < ? GROUP BY s`,
      )
      .all(agentId, period.from, period.to)) as { s: Sentiment | "unread"; n: number }[];
    const totals = { positive: 0, neutral: 0, negative: 0, unread: 0 };
    for (const r of rows) totals[r.s] = Number(r.n);
    return totals;
  };
  const rows = (await db()
    .prepare(
      `SELECT substr(started_at, 1, 10) AS day, (meta::jsonb->>'sentiment') AS s, COUNT(*) AS n FROM conversations
       WHERE agent_id = ? AND channel NOT IN ('test', 'playground') AND started_at >= ? AND started_at < ? AND (meta::jsonb->>'sentiment') IS NOT NULL GROUP BY day, s`,
    )
    .all(agentId, p.from, p.to)) as { day: string; s: Sentiment; n: number }[];
  const byDay = new Map<string, Record<Sentiment, number>>();
  for (let t = new Date(p.from).getTime(); t < new Date(p.to).getTime(); t += 86_400_000) byDay.set(new Date(t).toISOString().slice(0, 10), { positive: 0, neutral: 0, negative: 0 });
  for (const r of rows) {
    const d = byDay.get(r.day);
    if (d) d[r.s] = Number(r.n);
  }
  return { totals: await totalsFor(p), previous: await totalsFor(previousPeriod(p)), days: [...byDay].map(([date, c]) => ({ date, ...c })) };
}
