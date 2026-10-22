import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SUBMISSION_RANGES, SubmissionsTable } from "@/components/activity/SubmissionsTable";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { daysAgo } from "@/lib/rows";
import { listActions } from "@/platform/actions";
import { requireAgent } from "@/platform/session";
import { listSubmissions } from "@/platform/submissions";

export const metadata: Metadata = { title: "Leads" };

/** Activity › Leads: the contact details visitors left through the "Collect leads" action. */
export default async function LeadsPage({ params, searchParams }: PageProps<"/app/agents/[id]/leads">) {
  const { agent } = await requireAgent((await params).id);
  const asked = (await searchParams).range;
  const range = SUBMISSION_RANGES.some(([k]) => k === asked) ? String(asked) : "30";
  const from = range === "all" ? undefined : daysAgo(Number(range));
  const forms = Object.fromEntries((await listActions(agent.id)).map((a) => [a.id, a.title]));
  return (
    <>
      <PageBar icon={<UserPlus className="size-[18px]" />} title="Leads" />
      <PageBody wide>
        <SubmissionsTable
          agentId={agent.id}
          base={`/app/agents/${agent.id}/leads`}
          range={range}
          submissions={await listSubmissions(agent.id, ["lead"], from ? { from } : {})}
          formNames={forms}
          exportKind="leads"
          empty={{
            icon: <UserPlus className="size-5" />,
            title: "No leads yet",
            text: (
              <>
                Add the <Link href={`/app/agents/${agent.id}/actions`} className="font-medium underline underline-offset-2">Collect leads</Link> action and the agent asks interested visitors for their details.
              </>
            ),
          }}
        />
      </PageBody>
    </>
  );
}
