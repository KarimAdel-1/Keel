import { LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";
import { WidgetsManager } from "@/components/build/WidgetsManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { requireAgent } from "@/platform/session";
import { WIDGET_STARTERS, listWidgets } from "@/platform/widgets";

export const metadata: Metadata = { title: "Widgets" };

export default async function WidgetsPage({ params }: PageProps<"/app/agents/[id]/widgets">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<LayoutTemplate className="size-[18px]" />} title="Widgets" />
      <PageBody>
        <WidgetsManager industry={agent.config.industry} agentId={agent.id} initial={await listWidgets(agent.id)} starters={WIDGET_STARTERS} color={agent.config.appearance.color} />
      </PageBody>
    </>
  );
}
