import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { KnowledgeWorkspace } from "@/components/knowledge/KnowledgeWorkspace";
import { PageBar } from "@/components/shell/PageBar";
import { SetupSteps } from "@/components/setup/SetupSteps";
import { siteReads } from "@/platform/knowledge/jobs";
import { requireAgent } from "@/platform/session";
import { listSources } from "@/platform/store";

export const metadata: Metadata = { title: "Add more knowledge" };

export default async function SetupKnowledgePage({ params }: PageProps<"/app/agents/[id]/setup/knowledge">) {
  const { agent } = await requireAgent((await params).id);
  const name = agent.config.appearance.displayName;
  return (
    <>
      <PageBar icon={<BookOpen className="size-[18px]" />} title="New agent" actions={<div className="hidden md:block"><SetupSteps current={3} /></div>} />
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Add anything else {name} should know</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Price lists, policies, FAQs, opening hours: documents, typed notes, or questions with the exact answer you want. {name} answers only from what&apos;s here.</p>
        </div>
        <KnowledgeWorkspace agent={agent} initial={{ sources: await listSources(agent.id), reads: siteReads(agent.id) }} continueHref={`/app/agents/${agent.id}/setup/try`} />
      </div>
    </>
  );
}
