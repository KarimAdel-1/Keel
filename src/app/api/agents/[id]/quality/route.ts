import { listQualityChecks, startQualityCheck } from "@/platform/quality";
import { apiAgent } from "@/platform/session";

/** The agent's quality checks, newest first. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/quality">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ checks: await listQualityChecks(access.agent.id) });
}

/** Starts a quality check, in the background. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/quality">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const started = await startQualityCheck(access.agent.id, access.user.id);
  if (!("id" in started)) return Response.json(started, { status: 409 });
  return Response.json({ check: started }, { status: 202 });
}
