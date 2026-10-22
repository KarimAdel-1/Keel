import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { SourcesManager } from "@/components/knowledge/SourcesManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { LIMITS } from "@/core/limits";
import { siteReads } from "@/platform/knowledge/jobs";
import { requireAgent } from "@/platform/session";
import { listSources } from "@/platform/store";

export const metadata: Metadata = { title: "What it knows" };

export default async function SourcesPage({ params }: PageProps<"/app/agents/[id]/sources">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<BookOpen className="size-[18px]" />} title="What it knows" />
      <PageBody wide>
        <SourcesManager agentId={agent.id} initial={{ sources: await listSources(agent.id), reads: siteReads(agent.id) }} limitChars={LIMITS.knowledgeChars} resync={agent.config.resync} />
      </PageBody>
    </>
  );
}
