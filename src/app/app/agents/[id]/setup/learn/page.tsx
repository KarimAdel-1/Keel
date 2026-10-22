import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { PageBar } from "@/components/shell/PageBar";
import { LearnStep } from "@/components/setup/LearnStep";
import { SetupSteps } from "@/components/setup/SetupSteps";
import { siteReads } from "@/platform/knowledge/jobs";
import { requireAgent } from "@/platform/session";
import { listSources } from "@/platform/store";

export const metadata: Metadata = { title: "Learning about your business" };

export default async function LearnPage({ params }: PageProps<"/app/agents/[id]/setup/learn">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<Sparkles className="size-[18px]" />} title="New agent" actions={<div className="hidden md:block"><SetupSteps current={2} /></div>} />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
        <LearnStep agent={agent} initial={{ sources: await listSources(agent.id), reads: siteReads(agent.id) }} />
      </div>
    </>
  );
}
