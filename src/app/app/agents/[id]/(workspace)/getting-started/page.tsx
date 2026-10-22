import { Home } from "lucide-react";
import type { Metadata } from "next";
import { GoalsPicker } from "@/components/build/GoalsPicker";
import { SetupChecklist } from "@/components/setup/SetupChecklist";
import { TodoList } from "@/components/setup/TodoList";
import { BrowserAlertsLoader } from "@/components/shell/BrowserAlertsLoader";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { goalStatus } from "@/platform/goals";
import { requireAgent } from "@/platform/session";
import { setupSteps, todos } from "@/platform/setup";

export const metadata: Metadata = { title: "Home" };

/**
 * The agent's home: what to fix first (each with a one-click fix where Keel can make it), what the agent does (the
 * owner's goals, one switch each), and the steps to a live, tested agent.
 */
export default async function AgentHomePage({ params }: PageProps<"/app/agents/[id]/getting-started">) {
  const { agent } = await requireAgent((await params).id);
  return (
    <>
      <PageBar icon={<Home className="size-[18px]" />} title="Home" actions={<BrowserAlertsLoader />} />
      <PageBody>
        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">To do</h2>
            <p className="mt-0.5 text-sm text-muted">What would leave your customers stuck comes first.</p>
          </div>
          <TodoList agentId={agent.id} initial={await todos(agent)} />
        </section>
        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">What should {agent.config.appearance.displayName} do?</h2>
            <p className="mt-0.5 text-sm text-muted">Switch on what your business needs. Keel sets it up; you can fine-tune it later in More tools › What it can do.</p>
          </div>
          <GoalsPicker agentId={agent.id} initial={await goalStatus(agent.id)} />
        </section>
        <section className="space-y-3">
          <div>
            <h2 className="text-[15px] font-semibold">Getting started</h2>
            <p className="mt-0.5 text-sm text-muted">Everything {agent.name} needs to look after your customers well. Do them in any order; skip what doesn&apos;t apply to you.</p>
          </div>
          <SetupChecklist agentId={agent.id} steps={await setupSteps(agent)} />
        </section>
      </PageBody>
    </>
  );
}
