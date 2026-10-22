import { Wand2 } from "lucide-react";
import type { Metadata } from "next";
import { ImproveManager } from "@/components/improve/ImproveManager";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { membersOf } from "@/platform/accounts";
import { listActions } from "@/platform/actions";
import { listImprovements } from "@/platform/improve";
import { memoryOf } from "@/platform/memory";
import { requireAgent } from "@/platform/session";
import { listTests } from "@/platform/tests";
import { listVersions } from "@/platform/versions";

export const metadata: Metadata = { title: "Improve" };

/** Improve: the improvement agent's sessions, and the agent's versions. */
export default async function ImprovePage({ params }: PageProps<"/app/agents/[id]/improve">) {
  const { agent, workspace } = await requireAgent((await params).id);
  const tests = (await listTests(agent.id));
  const people = Object.fromEntries((await membersOf(workspace.id)).map((m) => [m.id, m.name]));
  return (
    <>
      <PageBar icon={<Wand2 className="size-[18px]" />} title="Improve" />
      <PageBody wide>
        <ImproveManager
          agentId={agent.id}
          initialSessions={await listImprovements(agent.id)}
          testCount={tests.length}
          names={Object.fromEntries(tests.map((t) => [t.id, t.name]))}
          actions={Object.fromEntries((await listActions(agent.id)).map((a) => [a.name, a.description]))}
          lessons={await memoryOf(agent.id, 50)}
          versions={(await listVersions(agent.id)).map((v) => ({ id: v.id, label: v.label, origin: v.origin, createdAt: v.createdAt, ...(v.authorId && people[v.authorId] ? { author: people[v.authorId] } : {}) }))}
        />
      </PageBody>
    </>
  );
}
