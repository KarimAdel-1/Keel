import { resyncAgent } from "@/platform/knowledge/resync";
import { apiAgent } from "@/platform/session";

/** Reads the agent's websites again now; only pages that changed are learned again. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/sources/resync">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ sites: await resyncAgent(access.agent.id) });
}
