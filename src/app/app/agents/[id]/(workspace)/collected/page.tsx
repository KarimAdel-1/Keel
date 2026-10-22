import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SUBMISSION_RANGES, SubmissionsTable } from "@/components/activity/SubmissionsTable";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { daysAgo } from "@/lib/rows";
import { listActions } from "@/platform/actions";
import { requireAgent } from "@/platform/session";
import { listSubmissions } from "@/platform/submissions";

export const metadata: Metadata = { title: "Collected data" };

/** Activity › Collected data: what visitors filled in through "Collect data" and custom forms. */
export default async function CollectedPage({ params, searchParams }: PageProps<"/app/agents/[id]/collected">) {
  const { agent } = await requireAgent((await params).id);
  const asked = (await searchParams).range;
  const range = SUBMISSION_RANGES.some(([k]) => k === asked) ? String(asked) : "30";
  const from = range === "all" ? undefined : daysAgo(Number(range));
  const forms = Object.fromEntries((await listActions(agent.id)).map((a) => [a.id, a.title]));
  return (
    <>
      <PageBar icon={<ClipboardList className="size-[18px]" />} title="Collected data" />
      <PageBody wide>
        <SubmissionsTable
          agentId={agent.id}
          base={`/app/agents/${agent.id}/collected`}
          range={range}
          submissions={await listSubmissions(agent.id, ["data", "form"], from ? { from } : {})}
          formNames={forms}
          exportKind="data"
          empty={{
            icon: <ClipboardList className="size-5" />,
            title: "Nothing collected yet",
            text: (
              <>
                Add a <Link href={`/app/agents/${agent.id}/actions`} className="font-medium underline underline-offset-2">Collect data or Show a form</Link> action to ask visitors for an order number, a booking date or anything else.
              </>
            ),
          }}
        />
      </PageBody>
    </>
  );
}
