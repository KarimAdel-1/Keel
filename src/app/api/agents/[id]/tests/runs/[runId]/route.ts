import { apiAgent } from "@/platform/session";
import { getRun } from "@/platform/tests";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/tests/runs/[runId]">) {
  const { id, runId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const run = (await getRun(runId));
  if (!run || run.agentId !== access.agent.id) return Response.json({ error: "That run doesn't exist." }, { status: 404 });
  return Response.json({ run });
}
