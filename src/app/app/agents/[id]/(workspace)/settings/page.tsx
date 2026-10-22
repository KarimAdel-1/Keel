import { Settings } from "lucide-react";
import type { Metadata } from "next";
import { SettingsForm } from "@/components/agent/SettingsForm";
import { ApiKeys } from "@/components/settings/ApiKeys";
import { ContactFields } from "@/components/settings/ContactFields";
import { Webhooks } from "@/components/settings/Webhooks";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { LinkTabs } from "@/components/ui";
import { listKeys } from "@/platform/apikeys";
import { contactFields } from "@/platform/contacts";
import { requireAgent } from "@/platform/session";
import { listConversations, sourceSummary } from "@/platform/store";
import { agentTokens } from "@/platform/usage";
import { EVENT_INFO, WEBHOOK_EVENTS, listWebhooks } from "@/platform/webhooks";

export const metadata: Metadata = { title: "Settings" };

const TABS = [
  ["general", "General"],
  ["fields", "Custom fields"],
  ["webhooks", "Webhooks"],
  ["keys", "API keys"],
] as const;

/** The agent's settings: general, the workspace's contact fields, webhooks and API keys. */
export default async function SettingsPage({ params, searchParams }: PageProps<"/app/agents/[id]/settings">) {
  const { agent, workspace } = await requireAgent((await params).id);
  const asked = (await searchParams).tab;
  const tab = TABS.find(([k]) => k === asked)?.[0] ?? "general";
  const base = `/app/agents/${agent.id}/settings`;

  return (
    <>
      <PageBar icon={<Settings className="size-[18px]" />} title="Settings" />
      <PageBody>
        <LinkTabs tabs={TABS.map(([key, label]) => ({ key, label, href: key === "general" ? base : `${base}?tab=${key}` }))} active={tab} />
        {tab === "general" && (
          <SettingsForm
            agent={agent}
            stats={{ chars: (await sourceSummary(agent.id)).chars, tokens: await agentTokens(agent.id), conversations: (await listConversations(agent.id, 100_000, ["playground", "widget", "share", "api"])).length }}
          />
        )}
        {tab === "fields" && (
          <section className="card max-w-2xl p-5">
            <h2 className="text-[15px] font-semibold">Contact fields</h2>
            <p className="mb-4 mt-0.5 text-sm text-muted">Your own details about each contact, shared by every agent in {workspace.name}.</p>
            <ContactFields initial={await contactFields(workspace.id)} />
          </section>
        )}
        {tab === "webhooks" && (
          <section className="card max-w-3xl p-5">
            <h2 className="text-[15px] font-semibold">Webhooks</h2>
            <p className="mb-4 mt-0.5 text-sm text-muted">Keel calls your address with the details as JSON when one of these happens with {agent.name}.</p>
            <Webhooks agentId={agent.id} initial={await listWebhooks(agent.id)} events={WEBHOOK_EVENTS.map((key) => ({ key, text: EVENT_INFO[key] }))} />
          </section>
        )}
        {tab === "keys" && (
          <section className="card max-w-3xl p-5">
            <h2 className="text-[15px] font-semibold">API keys</h2>
            <p className="mb-4 mt-0.5 text-sm text-muted">For the REST API. A key works with every agent in {workspace.name}; see Channels for an example call.</p>
            <ApiKeys initial={await listKeys(workspace.id)} />
          </section>
        )}
      </PageBody>
    </>
  );
}
