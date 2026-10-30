import { Users } from "lucide-react";
import type { Metadata } from "next";
import { ApiKeys } from "@/components/settings/ApiKeys";
import { ContactFields } from "@/components/settings/ContactFields";
import { OnThisPage } from "@/components/shell/OnThisPage";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { AlertSettings } from "@/components/workspace/AlertSettings";
import { TeamManager } from "@/components/workspace/TeamManager";
import { WorkspaceName } from "@/components/workspace/WorkspaceName";
import { LIMITS } from "@/core/limits";
import { canSendMail } from "@/lib/mail";
import { membersOf, userSettings } from "@/platform/accounts";
import { listKeys } from "@/platform/apikeys";
import { contactFields } from "@/platform/contacts";
import { pendingInvites } from "@/platform/invites";
import { requireUser } from "@/platform/session";
import { listAgents } from "@/platform/store";

export const metadata: Metadata = { title: "Workspace settings" };

/** The page's sections, in order, for "On this page". */
const SECTIONS = ["Name", "Your alerts", "Limits", "Team", "Contact fields", "API keys"].map((title) => ({ id: title.toLowerCase().replaceAll(" ", "-"), title }));

/** Workspace settings: its name, the people in it, its limits, contact fields and API keys, with "On this page" beside them. */
export default async function WorkspacePage() {
  const { user, workspace } = await requireUser();
  const members = await membersOf(workspace.id);
  const agents = (await listAgents(workspace.id)).length;

  return (
    <>
      <PageBar icon={<Users className="size-[18px]" />} title="Workspace settings" />
      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_200px]">
          <aside className="lg:sticky lg:top-24 lg:order-last lg:self-start">
            <OnThisPage sections={SECTIONS} />
          </aside>
          <div className="min-w-0 space-y-6">
            <section id="name" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">Name</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">Your team sees it in the sidebar. Customers never do.</p>
              <WorkspaceName initial={workspace.name} canEdit={workspace.role !== "member"} />
            </section>

            <section id="your-alerts" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">Your alerts</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">So a customer who asks for a person never waits for someone to happen to look.</p>
              <AlertSettings initial={(await userSettings(user.id)).emailAlerts !== false} canEmail={canSendMail()} email={user.email} />
            </section>

            <section id="limits" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">Limits</h2>
              <p className="mt-0.5 text-sm text-muted">They keep the server responsive and agents reliable. Model use has no limit: see Usage.</p>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
                {(
                  [
                    ["Agents", `${agents} of ${LIMITS.agents}`],
                    ["Team members", `${members.length} of ${LIMITS.members}`],
                    ["Knowledge per agent", `${(LIMITS.knowledgeChars / 1_000_000).toLocaleString("en-GB")}M characters`],
                    ["Actions per agent", String(LIMITS.actionsPerAgent)],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted">{k}</dt>
                    <dd className="mt-1 font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section id="team" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">Team</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">Everyone here can build agents and answer tickets in the Helpdesk inbox.</p>
              <TeamManager members={members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role }))} invites={await pendingInvites(workspace.id)} me={user.id} canManage={workspace.role !== "member"} limit={LIMITS.members} />
            </section>

            <section id="contact-fields" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">Contact fields</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">Your own details about each contact, shared by every agent.</p>
              <ContactFields initial={await contactFields(workspace.id)} />
            </section>

            <section id="api-keys" className="card scroll-mt-36 p-5">
              <h2 className="text-[15px] font-semibold">API keys</h2>
              <p className="mb-4 mt-0.5 text-sm text-muted">For the REST API. A key works with every agent in {workspace.name}.</p>
              <ApiKeys initial={await listKeys(workspace.id)} />
            </section>
          </div>
        </div>
      </PageBody>
    </>
  );
}
