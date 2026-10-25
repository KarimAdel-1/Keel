import { Zap } from "lucide-react";
import type { Metadata } from "next";
import { GoalsPicker } from "@/components/build/GoalsPicker";
import { goalStatus } from "@/platform/goals";
import { ActionsManager } from "@/components/build/ActionsManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { listActions, maskedAction } from "@/platform/actions";
import { requireAgent } from "@/platform/session";
import { listWidgets } from "@/platform/widgets";

export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage({ params }: PageProps<"/app/agents/[id]/actions">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<Zap className="size-[18px]" />} title="Actions" />
      <PageBody>
        <ActionsManager industry={agent.config.industry} agentId={agent.id} initial={(await listActions(agent.id)).map(maskedAction)} widgets={(await listWidgets(agent.id)).map((w) => ({ id: w.id, name: w.name }))} />
        <details id="goals" className="report-detail" open><summary>Business goals · manage the actions your agent needs</summary><GoalsPicker agentId={agent.id} initial={await goalStatus(agent.id)} /></details>
      </PageBody>
    </>
  );
}
