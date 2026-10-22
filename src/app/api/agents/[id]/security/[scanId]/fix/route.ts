import { runningImprovement, startImprovement } from "@/platform/improve";
import { getScan, securityTests } from "@/platform/security";
import { apiAgent } from "@/platform/session";

/**
 * Fixes what got through a scan: the attacks become security tests (each sent word for word), and the improvement
 * agent looks for a fix that stops them without breaking the tests that pass. Nothing changes until it's applied.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/security/[scanId]/fix">) {
  const { id, scanId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const scan = await getScan(scanId);
  if (!scan || scan.agentId !== access.agent.id) return Response.json({ error: "That scan doesn't exist." }, { status: 404 });
  if (scan.status === "running") return Response.json({ error: "Wait for the scan to finish." }, { status: 409 });
  if (await runningImprovement(access.agent.id)) return Response.json({ error: "An improvement is already running for this agent: see Improve." }, { status: 409 });
  const { tests, skipped } = await securityTests(scan);
  if (!tests.length) {
    const error = skipped ? "This scan was made before Keel kept whole attacks, so they can't be replayed word for word. Run a new scan, then fix what gets through." : "Nothing got through this scan.";
    return Response.json({ error }, { status: 409 });
  }
  const started = await startImprovement(access.agent.id, { focus: tests.map((t) => t.id), authorId: access.user.id });
  if ("error" in started) return Response.json(started, { status: 409 });
  return Response.json({ session: started, tests: tests.length, skipped }, { status: 202 });
}
