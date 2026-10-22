import { forgetLessons, memoryOf } from "@/platform/memory";
import { apiAgent } from "@/platform/session";

/** What Keel's agents remember about this agent (src/platform/memory.ts), newest first. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/improve/memory">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ lessons: await memoryOf(access.agent.id, 50) });
}

/** Forgets it all: the next improvement starts fresh. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/improve/memory">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ forgotten: await forgetLessons(access.agent.id) });
}
