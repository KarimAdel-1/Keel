import { Frown, Meh, Smile, SmilePlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsBar } from "@/components/analytics/AnalyticsBar";
import { SentimentBars } from "@/components/analytics/charts";
import { periodOf, rangeOf } from "@/components/analytics/period";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Change, EmptyState, Panel, Stat } from "@/components/ui";
import { sentimentSummary } from "@/platform/analysis";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Sentiment" };

/** Analytics › Sentiment: how customers felt by the end of their conversations, per day and against the period before. */
export default async function SentimentPage({ params, searchParams }: PageProps<"/app/agents/[id]/analytics/sentiment">) {
  const { agent } = await requireAgent((await params).id);
  const range = rangeOf((await searchParams).range);
  const s = (await sentimentSummary(agent.id, periodOf(range)));
  const read = s.totals.positive + s.totals.neutral + s.totals.negative;
  const pct = (n: number) => (read ? `${Math.round((n / read) * 100)}% of read conversations` : "None read yet");

  return (
    <>
      <PageBar icon={<SmilePlus className="size-[18px]" />} title="Sentiment" />
      <PageBody wide>
        <AnalyticsBar agentId={agent.id} base={`/app/agents/${agent.id}/analytics/sentiment`} range={range} unread={s.totals.unread} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Positive" icon={<Smile className="size-4 text-[#12b76a]" />} value={s.totals.positive} note={<>{pct(s.totals.positive)} · <Change now={s.totals.positive} before={s.previous.positive} /></>} />
          <Stat label="Neutral" icon={<Meh className="size-4" />} value={s.totals.neutral} note={pct(s.totals.neutral)} />
          <Stat label="Negative" icon={<Frown className="size-4 text-[#f04438]" />} value={s.totals.negative} note={<>{pct(s.totals.negative)} · <Change now={s.totals.negative} before={s.previous.negative} /></>} />
        </div>
        {read === 0 ? (
          <EmptyState icon={<SmilePlus className="size-5" />} title="Nothing read yet" text="Press “Analyze conversations” and a fast model reads each finished conversation for how the customer felt by the end." />
        ) : (
          <Panel
            title="Sentiment per day"
            action={
              s.totals.negative > 0 && (
                <Link href={`/app/agents/${agent.id}/activity?show=negative&range=${range}`} className="text-xs font-medium underline underline-offset-2">
                  See unhappy conversations
                </Link>
              )
            }
          >
            <SentimentBars days={s.days} />
          </Panel>
        )}
      </PageBody>
    </>
  );
}
