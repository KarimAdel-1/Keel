import { TestTubes } from "lucide-react";
import type { Metadata } from "next";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { SecurityScanPanel } from "@/components/tests/SecurityScanPanel";
import { TestsManager } from "@/components/tests/TestsManager";
import { LinkTabs } from "@/components/ui";
import { garakInstalled } from "@/lib/garak";
import { listActions } from "@/platform/actions";
import { listScans } from "@/platform/security";
import { requireAgent } from "@/platform/session";
import { batches, latestRuns, listTests } from "@/platform/tests";

export const metadata: Metadata = { title: "Tests" };

/** Tests: a crowd of AI customers, each run judged against what the agent should have done; and security scans. */
export default async function TestsPage({ params, searchParams }: PageProps<"/app/agents/[id]/tests">) {
  const { agent } = await requireAgent((await params).id);
  const tab = (await searchParams).tab === "security" ? "security" : "tests";
  const base = `/app/agents/${agent.id}/tests`;
  const latest = (await latestRuns(agent.id));
  return (
    <>
      <PageBar icon={<TestTubes className="size-[18px]" />} title="Tests" />
      <PageBody wide>
        <LinkTabs
          tabs={[
            { key: "tests", label: "AI customers", href: base },
            { key: "security", label: "Security scan", href: `${base}?tab=security` },
          ]}
          active={tab}
        />
        {tab === "tests" ? (
          <TestsManager
            agentId={agent.id}
            initialTests={(await listTests(agent.id)).map((t) => ({ ...t, latest: latest.get(t.id) ?? null }))}
            initialBatches={await batches(agent.id)}
            actionNames={(await listActions(agent.id)).filter((a) => a.kind !== "followups").map((a) => a.name)}
          />
        ) : (
          <SecurityScanPanel
            agentId={agent.id}
            initial={await listScans(agent.id)}
            installed={garakInstalled()}
            railsOn={agent.config.protection.nemo.enabled}
          />
        )}
      </PageBody>
    </>
  );
}
