import { Inbox, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { TicketView } from "@/components/helpdesk/TicketView";
import { BrowserAlertsLoader } from "@/components/shell/BrowserAlertsLoader";
import { PageBar } from "@/components/shell/PageBar";
import { Pill, timeAgo } from "@/components/ui";
import { membersOf } from "@/platform/accounts";
import { getContact } from "@/platform/contacts";
import { STATUS_INFO, TICKET_STATUSES, getTicket, listTickets, openTicketsByAgent, ticketCounts, ticketEvents, type InboxView, type TicketStatus } from "@/platform/helpdesk";
import { requireUser } from "@/platform/session";
import { conversationMessages, getAgent, listAgents } from "@/platform/store";
import { toTranscript } from "@/platform/transcript";

export const metadata: Metadata = { title: "Helpdesk inbox" };

const VIEWS: { key: InboxView; label: string }[] = [
  { key: "mine", label: "Assigned to me" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All open" },
  { key: "solved", label: "Solved and closed" },
];
const TONE: Record<TicketStatus, "neutral" | "good" | "warn" | "bad" | "brand"> = { new: "brand", open: "warn", waiting: "neutral", on_hold: "neutral", solved: "good", closed: "neutral" };

/**
 * The Helpdesk inbox: tickets from every agent in the workspace, where the team takes over from an agent. Views by
 * owner, and (with several agents) by agent: opened from an agent's menu, it shows that agent's tickets first. A ticket
 * shows the whole chat, and a reply lands in the customer's chat window.
 */
export default async function HelpdeskPage({ searchParams }: PageProps<"/app/helpdesk">) {
  const { user, workspace } = await requireUser();
  const query = await searchParams;
  const agents = await listAgents(workspace.id);
  const onlyAgent = agents.find((a) => a.id === query.agent)?.id;
  const counts = await ticketCounts(workspace.id, user.id, onlyAgent);
  const byAgent = agents.length > 1 ? await openTicketsByAgent(workspace.id) : {};
  const view = VIEWS.find((v) => v.key === query.view)?.key ?? (counts.mine ? "mine" : counts.unassigned ? "unassigned" : "all");
  const tickets = await listTickets(workspace.id, view, user.id, onlyAgent);
  const wanted = typeof query.t === "string" ? await getTicket(query.t) : undefined;
  const wantedAgent = wanted ? await getAgent(wanted.agentId) : undefined;
  const selected = wanted && wantedAgent?.workspaceId === workspace.id ? { ...wanted, agentName: wantedAgent.name } : tickets[0];
  const agent = selected ? await getAgent(selected.agentId) : undefined;
  const names = Object.fromEntries((await membersOf(workspace.id)).map((m) => [m.id, m.name]));
  const contact = selected?.contactId ? await getContact(selected.contactId) : undefined;
  const href = (next: { view?: InboxView; t?: string; agent?: string | null }) => {
    const agentParam = next.agent === undefined ? onlyAgent : next.agent;
    return `/app/helpdesk?${new URLSearchParams({ view: next.view ?? view, ...(agentParam ? { agent: agentParam } : {}), ...(next.t ? { t: next.t } : {}) })}`;
  };
  const allOpen = Object.values(byAgent).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <PageBar icon={<LifeBuoy className="size-[18px]" />} title="Helpdesk inbox" actions={<BrowserAlertsLoader />} />
      <div className="grid min-h-[calc(100dvh-57px)] lg:h-[calc(100dvh-57px)] lg:grid-cols-[180px_260px_minmax(0,1fr)] 2xl:grid-cols-[200px_300px_minmax(0,1fr)]">
        <nav className="border-b border-line p-3 lg:border-b-0 lg:border-r" aria-label="Views">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href({ view: v.key })} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${view === v.key ? "bg-panel-2 font-medium text-ink" : "text-muted hover:bg-panel-2/60 hover:text-ink"}`}>
              {v.label}
              <span className="text-xs tabular-nums text-subtle">{counts[v.key]}</span>
            </Link>
          ))}
          {agents.length > 1 && (
            <>
              <p className="eyebrow px-3 pb-1 pt-5">Agents</p>
              {[{ id: null, name: "All agents", open: allOpen }, ...agents.map((a) => ({ id: a.id, name: a.name, open: byAgent[a.id] ?? 0 }))].map((a) => (
                <Link
                  key={a.id ?? "all"}
                  href={href({ agent: a.id })}
                  aria-current={(a.id ?? undefined) === onlyAgent ? "page" : undefined}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${(a.id ?? undefined) === onlyAgent ? "bg-panel-2 font-medium text-ink" : "text-muted hover:bg-panel-2/60 hover:text-ink"}`}
                >
                  <span className="truncate">{a.name}</span>
                  <span className="text-xs tabular-nums text-subtle" title="Open tickets">{a.open}</span>
                </Link>
              ))}
            </>
          )}
        </nav>
        <ul className="min-h-0 divide-y divide-line overflow-y-auto border-b border-line lg:border-b-0 lg:border-r">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={href({ t: t.id })} className={`block px-4 py-3 ${t.id === selected?.id ? "bg-brand-tint/60" : "hover:bg-panel-2"}`}>
                <div className="flex items-center gap-2">
                  <Pill tone={TONE[t.status]}>{STATUS_INFO[t.status].label}</Pill>
                  {t.priority === "high" && <Pill tone="bad">Urgent</Pill>}
                  <span className="ml-auto text-[11px] text-subtle">{timeAgo(t.updatedAt)}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-medium">{t.subject}</p>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {t.agentName}
                  {t.assigneeId ? ` · ${names[t.assigneeId] ?? "Someone"}` : " · Unassigned"}
                </p>
              </Link>
            </li>
          ))}
          {!tickets.length && <li className="px-4 py-10 text-center text-sm text-muted">No tickets here.</li>}
        </ul>
        <div className="flex min-h-[480px] flex-col bg-panel">
          {selected && agent ? (
            <TicketView
              key={selected.id}
              ticket={{
                id: selected.id,
                agentId: agent.id,
                agentName: agent.name,
                agentDisplayName: agent.config.appearance.displayName,
                ...(selected.conversationId ? { conversationId: selected.conversationId } : {}),
                subject: selected.subject,
                summary: selected.summary,
                status: selected.status,
                priority: selected.priority,
                ...(selected.assigneeId ? { assignee: names[selected.assigneeId] ?? "Someone" } : {}),
                mine: selected.assigneeId === user.id,
                createdAt: selected.createdAt,
                ...(contact ? { contact: { name: contact.name, email: contact.email, phone: contact.phone } } : {}),
              }}
              statuses={TICKET_STATUSES.map((key) => ({ key, ...STATUS_INFO[key] }))}
              messages={selected.conversationId ? toTranscript(await conversationMessages(selected.conversationId)) : []}
              history={(await ticketEvents(selected.id)).map((e) => ({ id: e.id, kind: e.kind, body: e.body, createdAt: e.createdAt, ...(e.authorId ? { author: e.authorId.startsWith("ext:") ? e.authorId.slice(4) : (names[e.authorId] ?? "Someone") } : {}) }))}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
              <Inbox className="size-8 text-subtle" />
              <p className="text-sm font-medium">No tickets yet</p>
              <p className="max-w-sm text-sm text-muted">
                When an agent can&apos;t solve something, or a customer asks for a person, a ticket opens here. Add the &ldquo;Create a ticket&rdquo; or &ldquo;Live handover&rdquo; action to an agent to turn it on.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
