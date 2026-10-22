import { BarChart3, MessageSquare, MessagesSquare, Users, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import { AnalyticsBar } from "@/components/analytics/AnalyticsBar";
import { TrendChart } from "@/components/analytics/charts";
import { periodOf, rangeOf } from "@/components/analytics/period";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Change, Panel, Stat } from "@/components/ui";
import { chatsSummary, sentimentSummary } from "@/platform/analysis";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Chats" };

/** Analytics › Chats: how many conversations, messages and visitors in a period, against the period before. */
export default async function ChatsPage({ params, searchParams }: PageProps<"/app/agents/[id]/analytics">) {
  const { agent } = await requireAgent((await params).id);
  const range = rangeOf((await searchParams).range);
  const period = periodOf(range);
  const s = (await chatsSummary(agent.id, period));
  const unread = (await sentimentSummary(agent.id, period)).totals.unread;
  const share = (n: number) => (s.conversations ? `${Math.round((n / s.conversations) * 100)}% of conversations` : "No conversations yet");

  return (
    <>
      <PageBar icon={<BarChart3 className="size-[18px]" />} title="Chats" />
      <PageBody wide>
        <AnalyticsBar agentId={agent.id} base={`/app/agents/${agent.id}/analytics`} range={range} unread={unread} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Conversations" icon={<MessagesSquare className="size-4" />} value={s.conversations} note={<Change now={s.conversations} before={s.previous.conversations} />} />
          <Stat label="Messages" icon={<MessageSquare className="size-4" />} value={s.messages} note={<Change now={s.messages} before={s.previous.messages} />} />
          <Stat label="Visitors" icon={<Users className="size-4" />} value={s.visitors} note={<Change now={s.visitors} before={s.previous.visitors} />} />
          <Stat label="Handed to your team" icon={<UserRoundCheck className="size-4" />} value={s.handedOver} note={share(s.handedOver)} />
        </div>
        <Panel title="Conversations per day">
          <TrendChart days={s.days.map((d) => ({ date: d.date, value: d.conversations, previous: d.previous }))} />
        </Panel>
        <p className="text-xs text-muted">Your own chats in Try it and test runs aren&apos;t counted.</p>
      </PageBody>
    </>
  );
}
