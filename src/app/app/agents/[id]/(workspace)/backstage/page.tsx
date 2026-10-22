import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { BackstageChat } from "@/components/backstage/BackstageChat";
import { PageBar } from "@/components/shell/PageBar";
import { backstageMessages, findings } from "@/platform/backstage";
import { browserThread, requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Copilot" };

/** Copilot: the builder's main agent, which hands requests to Keel's specialists (src/platform/copilot.ts). */
export default async function BackstagePage({ params }: PageProps<"/app/agents/[id]/backstage">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<Sparkles className="size-[18px]" />} title="Copilot" />
      <div className="px-4 py-5 sm:px-6">
        <BackstageChat agentId={agent.id} agentName={agent.name} initial={await backstageMessages(agent.id, await browserThread())} findings={await findings(agent)} />
      </div>
    </>
  );
}
