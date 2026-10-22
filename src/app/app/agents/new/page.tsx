import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { PageBar } from "@/components/shell/PageBar";
import { SetupSteps } from "@/components/setup/SetupSteps";
import { StartForm } from "@/components/setup/StartForm";
import { requireUser } from "@/platform/session";
import { listAgents } from "@/platform/store";

export const metadata: Metadata = { title: "New agent" };

export default async function NewAgentPage() {
  const { workspace } = await requireUser();
  // The websites the workspace's agents were made from, so reading one again can be pointed out.
  const existing = (await listAgents(workspace.id)).flatMap((a) => (a.config.profile.website ? [{ id: a.id, name: a.name, website: a.config.profile.website }] : []));
  return (
    <>
      <PageBar icon={<Plus className="size-[18px]" />} title="New agent" actions={<div className="hidden md:block"><SetupSteps current={1} /></div>} />
      <div className="px-4 py-12 sm:px-6 sm:py-16">
        <StartForm existing={existing} />
      </div>
    </>
  );
}
