import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import { SuggestionsList } from "@/components/build/SuggestionsList";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { requireAgent } from "@/platform/session";
import { listSuggestions } from "@/platform/suggestions";

export const metadata: Metadata = { title: "Answers to add" };

export default async function SuggestionsPage({ params }: PageProps<"/app/agents/[id]/suggestions">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<Lightbulb className="size-[18px]" />} title="Answers to add" />
      <PageBody>
        <SuggestionsList agentId={agent.id} initial={await listSuggestions(agent.id, "all")} />
      </PageBody>
    </>
  );
}
