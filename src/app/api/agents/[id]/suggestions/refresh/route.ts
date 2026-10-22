import { apiAgent } from "@/platform/session";
import { findConflicts, findGaps, listSuggestions } from "@/platform/suggestions";

/** Looks again for questions nothing answers and for sources that contradict each other. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/suggestions/refresh">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  await findGaps(access.agent.id);
  await findConflicts(access.agent.id);
  return Response.json({ suggestions: await listSuggestions(access.agent.id, "all") });
}
