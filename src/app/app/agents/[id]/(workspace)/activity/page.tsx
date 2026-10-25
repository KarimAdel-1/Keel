import { Inbox, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConversationFilters } from "@/components/activity/ConversationFilters";
import { RANGES, SHOWS, SOURCES } from "@/components/activity/filters";
import { ConversationView } from "@/components/activity/ConversationView";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Pill, timeAgo } from "@/components/ui";
import { daysAgo } from "@/lib/rows";
import { getContact } from "@/platform/contacts";
import { STATUS_INFO, conversationTickets } from "@/platform/helpdesk";
import { requireAgent } from "@/platform/session";
import { MESSAGING_CHANNELS, conversationAgent, conversationMessages, conversationSummary, listConversations, lowConfidenceConversations, type Channel } from "@/platform/store";
import { toTranscript } from "@/platform/transcript";

export const metadata: Metadata = { title: "Conversations" };

const SOURCE: Record<Channel, string> = { playground: "Try it", widget: "Website", share: "Chat page", api: "API", test: "Test run", whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram", telegram: "Telegram" };
const SENTIMENT_DOT: Record<string, string> = { positive: "bg-[#12b76a]", neutral: "bg-[#98a2b3]", negative: "bg-[#f04438]" };
const param = (v: string | string[] | undefined, allowed: readonly (readonly [string, string])[], fallback: string) => (typeof v === "string" && allowed.some(([k]) => k === v) ? v : fallback);

/**
 * Activity › Conversations: every chat with the agent, filtered by when, where and how it went. The chat shows how sure
 * each answer was, its sources and the actions taken; any answer can be revised into a Q&A.
 */
export default async function ConversationsPage({ params, searchParams }: PageProps<"/app/agents/[id]/activity">) {
  const { agent } = await requireAgent((await params).id);
  const query = await searchParams;
  const range = param(query.range, RANGES, "30");
  const source = param(query.source, SOURCES, "all");
  const show = param(query.show, SHOWS, "all");
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 200) : "";

  const since = range === "all" ? "" : daysAgo(Number(range));
  const low = show === "low" ? await lowConfidenceConversations(agent.id) : undefined;
  const all = await listConversations(agent.id, 500, source === "all" ? ["playground", "widget", "share", "api", ...MESSAGING_CHANNELS] : [source as Channel]);
  const shown = all.filter(
    (c) =>
      c.lastAt >= since &&
      (show !== "low" || low?.has(c.id)) &&
      (show !== "handed_off" || c.status === "handed_off") &&
      (show !== "paused" || c.status === "paused") &&
      (show !== "negative" || c.meta.sentiment === "negative"),
  );
  // A search reads each conversation's messages.
  const said = q ? await Promise.all(shown.map(async (c) => (await conversationMessages(c.id)).some((m) => m.content.toLowerCase().includes(q.toLowerCase())))) : [];
  const conversations = q ? shown.filter((_, i) => said[i]) : shown;

  const wanted = typeof query.c === "string" ? query.c : undefined;
  const selectedId = wanted && (await conversationAgent(wanted)) === agent.id ? wanted : conversations[0]?.id;
  const selected = selectedId ? (conversations.find((c) => c.id === selectedId) ?? (await conversationSummary(selectedId))) : undefined;
  const stored = selected ? await conversationMessages(selected.id) : [];
  const contact = selected?.contactId ? await getContact(selected.contactId) : undefined;

  const keep = new URLSearchParams(Object.entries({ range, source, show, q }).filter(([k, v]) => v && v !== "all" && !(k === "range" && v === "30")));
  const href = (c: string) => `/app/agents/${agent.id}/activity?${new URLSearchParams([...keep, ["c", c]])}`;

  return (
    <>
      <PageBar icon={<MessagesSquare className="size-[18px]" />} title="Conversations" />
      <PageBody wide>
        <ConversationFilters agentId={agent.id} range={range} source={source} show={show} q={q} />
        <div className="card grid min-h-[560px] overflow-hidden lg:h-[calc(100dvh-13rem)] lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <p className="border-b border-line px-4 py-2.5 text-xs text-muted">
              {conversations.length} conversation{conversations.length === 1 ? "" : "s"}
            </p>
            <ul className="max-h-80 flex-1 divide-y divide-line overflow-y-auto lg:max-h-none">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link href={href(c.id)} className={`block px-4 py-3 transition ${c.id === selected?.id ? "bg-brand-tint/60" : "hover:bg-panel-2"}`}>
                    <div className="flex items-center gap-2">
                      <Pill tone={c.channel === "playground" ? "neutral" : "brand"}>{SOURCE[c.channel]}</Pill>
                      {/* The demo business's sample chats (npm run demo): written by Keel, answered by the real agent. */}
                      {c.meta.sample === true && <Pill tone="neutral">Sample</Pill>}
                      {c.status === "handed_off" && <Pill tone="brand">Team</Pill>}
                      {c.status === "paused" && <Pill tone="bad">Paused</Pill>}
                      {typeof c.meta.sentiment === "string" && <span className={`size-2 rounded-full ${SENTIMENT_DOT[c.meta.sentiment] ?? ""}`} title={c.meta.sentiment} />}
                      <span className="ml-auto text-[11px] text-subtle">{timeAgo(c.lastAt)}</span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-sm">{c.preview || "(No message)"}</p>
                    <p className="mt-1 text-[11px] text-subtle">
                      {c.messages} messages{typeof c.meta.topic === "string" ? ` · ${c.meta.topic}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
              {!conversations.length && (
                <li className="px-4 py-10 text-center text-sm text-muted">
                  {all.length ? "No conversations match these filters." : "No conversations yet. Try the agent in Try it, or put it on your website."}
                </li>
              )}
            </ul>
          </div>
          <div className="flex min-h-0 flex-col">
            {selected ? (
              <ConversationView
                key={selected.id}
                agentId={agent.id}
                agentName={agent.config.appearance.displayName}
                messages={toTranscript(stored)}
                details={{
                  id: selected.id,
                  title: selected.preview || "Conversation",
                  source: SOURCE[selected.channel],
                  status: selected.status,
                  startedAt: selected.startedAt,
                  lastAt: selected.lastAt,
                  messages: selected.messages,
                  tokens: stored.reduce((sum, m) => sum + (typeof m.meta.tokens === "number" ? m.meta.tokens : 0), 0),
                  ...(typeof selected.meta.country === "string" ? { country: selected.meta.country } : {}),
                  ...(typeof selected.meta.sentiment === "string" ? { sentiment: selected.meta.sentiment } : {}),
                  ...(typeof selected.meta.topic === "string" ? { topic: selected.meta.topic } : {}),
                  ...(contact ? { contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone } } : {}),
                  tickets: (await conversationTickets(selected.id)).map((t) => ({ id: t.id, subject: t.subject, status: STATUS_INFO[t.status].label })),
                }}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                <Inbox className="size-8 text-subtle" />
                <p className="text-sm font-medium">Nothing to show yet</p>
                <p className="max-w-sm text-sm text-muted">Conversations appear here as soon as someone chats with your agent, including your own in Try it.</p>
              </div>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
