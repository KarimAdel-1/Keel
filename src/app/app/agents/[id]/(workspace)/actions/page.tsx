import { Zap } from "lucide-react";
import type { Metadata } from "next";
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
        <ActionsManager agentId={agent.id} initial={(await listActions(agent.id)).map(maskedAction)} widgets={(await listWidgets(agent.id)).map((w) => ({ id: w.id, name: w.name }))} />
      </PageBody>
    </>
  );
}
