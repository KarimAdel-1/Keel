import { ContactRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactsManager } from "@/components/contacts/ContactsManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { contactFields, listContacts } from "@/platform/contacts";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Contacts" };

/** Contacts: everyone the workspace's agents have met or you've added. */
export default async function ContactsPage({ params, searchParams }: PageProps<"/app/agents/[id]/contacts">) {
  const { agent, workspace } = await requireAgent((await params).id);
  const asked = (await searchParams).q;
  const q = typeof asked === "string" ? asked.slice(0, 200) : "";
  const { contacts, total } = await listContacts(workspace.id, { search: q, limit: 50 });
  return (
    <>
      <PageBar
        icon={<ContactRound className="size-[18px]" />}
        title="Contacts"
        actions={
          <Link href={`/app/agents/${agent.id}/settings?tab=fields`} className="btn btn-secondary">
            Custom fields
          </Link>
        }
      />
      <PageBody wide>
        <ContactsManager agentId={agent.id} initial={contacts} total={total} fields={await contactFields(workspace.id)} q={q} />
      </PageBody>
    </>
  );
}
