import { z } from "zod";
import { listImprovements, runningImprovement, startImprovement } from "@/platform/improve";
import { apiAgent } from "@/platform/session";

/** The agent's improvement sessions and the one running. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/improve">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({
    sessions: await listImprovements(access.agent.id),
    running: await runningImprovement(access.agent.id) ?? null,
  });
}

/** Starts improving the agent in the background. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/improve">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z
    .object({ depth: z.enum(["quick", "balanced", "thorough"]).default("balanced"), fromConversations: z.boolean().default(false), focus: z.array(z.string().max(80)).max(40).optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose how thorough to be." }, { status: 400 });
  const started = await startImprovement(access.agent.id, { ...parsed.data, authorId: access.user.id });
  if ("error" in started) return Response.json(started, { status: 409 });
  return Response.json({ session: started }, { status: 202 });
}
