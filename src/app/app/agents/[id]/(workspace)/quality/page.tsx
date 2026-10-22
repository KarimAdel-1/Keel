import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { QualityPanel } from "@/components/quality/QualityPanel";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { listQualityChecks } from "@/platform/quality";
import { requireAgent } from "@/platform/session";
import { agentChunks } from "@/platform/store";

export const metadata: Metadata = { title: "Quality" };

/** Quality: how good the agent's answers are, whether its tests can be trusted, and whether the judges catch mistakes. */
export default async function QualityPage({ params }: PageProps<"/app/agents/[id]/quality">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<BadgeCheck className="size-[18px]" />} title="Quality" />
      <PageBody wide>
        <QualityPanel agentId={agent.id} initial={await listQualityChecks(agent.id)} hasKnowledge={(await agentChunks(agent.id)).length > 0} />
      </PageBody>
    </>
  );
}
