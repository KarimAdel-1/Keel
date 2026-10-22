import { Plug } from "lucide-react";
import type { Metadata } from "next";
import { IntegrationsManager } from "@/components/build/IntegrationsManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { publicUrl } from "@/lib/public-url";
import { listIntegrations, reachable, viewOf } from "@/platform/integrations";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Apps and tools" };

/** Channels › Apps and tools: WhatsApp, Messenger, Instagram and Telegram, and the team's Slack and helpdesk. */
export default async function IntegrationsPage({ params }: PageProps<"/app/agents/[id]/integrations">) {
  const { agent } = await requireAgent((await params).id);
  const base = await publicUrl();
  return (
    <>
      <PageBar icon={<Plug className="size-[18px]" />} title="Apps and tools" />
      <PageBody>
        <IntegrationsManager agentId={agent.id} initial={(await listIntegrations(agent.id)).map((i) => viewOf(i, base))} publicBase={base} reachable={reachable(base)} />
      </PageBody>
    </>
  );
}
