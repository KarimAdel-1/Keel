import { configChange, firstProblem } from "@/platform/agent-input";
import { startCheck } from "@/platform/improve";
import { apiAgent } from "@/platform/session";

/** Checks an unsaved change against the tests: what it fixes and what it breaks, before it's saved. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/improve/check">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = configChange.safeParse(((await request.json().catch(() => ({}))) as { change?: unknown }).change ?? {});
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const started = await startCheck(access.agent.id, parsed.data, access.user.id);
  if ("error" in started) return Response.json(started, { status: 409 });
  return Response.json({ session: started }, { status: 202 });
}
