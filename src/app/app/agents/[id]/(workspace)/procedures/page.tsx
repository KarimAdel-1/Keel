import { ListOrdered } from "lucide-react";
import type { Metadata } from "next";
import { ProceduresManager } from "@/components/build/ProceduresManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { listActions } from "@/platform/actions";
import { listProcedures } from "@/platform/procedures";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Step-by-step guides" };

export default async function ProceduresPage({ params }: PageProps<"/app/agents/[id]/procedures">) {
  const { agent } = await requireAgent((await params).id);
  const actions = (await listActions(agent.id))
    .filter((a) => a.kind !== "followups")
    .map((a) => ({ name: a.name, title: a.title, enabled: a.enabled }));
  return (
    <>
      <PageBar icon={<ListOrdered className="size-[18px]" />} title="Step-by-step guides" />
      <PageBody>
        <ProceduresManager agentId={agent.id} initial={await listProcedures(agent.id)} actions={actions} />
      </PageBody>
    </>
  );
}
