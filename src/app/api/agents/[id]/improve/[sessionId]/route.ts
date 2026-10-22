import { z } from "zod";
import { applyImprovement, discardImprovement, getImprovement, stopImprovement } from "@/platform/improve";
import { apiAgent } from "@/platform/session";
import { listTests } from "@/platform/tests";

async function find(params: RouteContext<"/api/agents/[id]/improve/[sessionId]">["params"]) {
  const { id, sessionId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const session = (await getImprovement(sessionId));
  if (!session || session.agentId !== access.agent.id) return Response.json({ error: "That improvement doesn't exist." }, { status: 404 });
  return { access, session };
}

/** One session, with its tests' names. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/improve/[sessionId]">) {
  const found = await find(params);
  if (found instanceof Response) return found;
  const names = Object.fromEntries((await listTests(found.access.agent.id)).map((t) => [t.id, t.name]));
  return Response.json({ session: found.session, names });
}

/** Applies a proven improvement, discards it, or stops a running session. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/improve/[sessionId]">) {
  const found = await find(params);
  if (found instanceof Response) return found;
  const parsed = z.object({ action: z.enum(["apply", "discard", "stop"]) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Apply, discard or stop." }, { status: 400 });
  if (parsed.data.action === "stop") await stopImprovement(found.session.id);
  else if (parsed.data.action === "discard") await discardImprovement(found.session.id);
  else {
    const result = (await applyImprovement(found.session.id, found.access.user.id));
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({ session: await getImprovement(found.session.id) });
}
