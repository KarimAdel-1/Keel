import { Tags } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsBar } from "@/components/analytics/AnalyticsBar";
import { periodOf, rangeOf } from "@/components/analytics/period";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { EmptyState, Panel } from "@/components/ui";
import { previousPeriod, sentimentSummary, topicCounts } from "@/platform/analysis";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Topics" };

/** Analytics › Topics: what customers came for, most common first, with how many left unhappy. */
export default async function TopicsPage({ params, searchParams }: PageProps<"/app/agents/[id]/analytics/topics">) {
  const { agent } = await requireAgent((await params).id);
  const range = rangeOf((await searchParams).range);
  const period = periodOf(range);
  const topics = (await topicCounts(agent.id, period));
  const before = new Map((await topicCounts(agent.id, previousPeriod(period))).map((t) => [t.topic, t.count]));
  const unread = (await sentimentSummary(agent.id, period)).totals.unread;
  const max = Math.max(1, ...topics.map((t) => t.count));
  const total = topics.reduce((n, t) => n + t.count, 0);

  return (
    <>
      <PageBar icon={<Tags className="size-[18px]" />} title="Topics" />
      <PageBody wide>
        <AnalyticsBar agentId={agent.id} base={`/app/agents/${agent.id}/analytics/topics`} range={range} unread={unread} />
        {topics.length === 0 ? (
          <EmptyState
            icon={<Tags className="size-5" />}
            title="No topics yet"
            text={unread ? `${unread} finished conversation${unread === 1 ? " is" : "s are"} waiting to be read. Press “Analyze conversations” to sort them by topic.` : "Once visitors chat with your agent, press “Analyze conversations” to see what they come for."}
          />
        ) : (
          <Panel title={`${total} conversation${total === 1 ? "" : "s"} by topic`} padded={false}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Topic</th>
                  <th className="w-1/2 px-4 py-2.5 font-medium">Conversations</th>
                  <th className="px-4 py-2.5 text-right font-medium">Before</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unhappy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {topics.map((t) => (
                  <tr key={t.topic}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/app/agents/${agent.id}/activity?q=${encodeURIComponent(t.topic.split(" ")[0])}&range=${range}`} className="hover:underline">
                        {t.topic}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${(t.count / max) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right tabular-nums">{t.count}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{before.get(t.topic) ?? 0}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${t.negative ? "text-bad" : "text-muted"}`}>{t.negative ? `${Math.round((t.negative / t.count) * 100)}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
