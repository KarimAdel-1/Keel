import { apiAgent } from "@/platform/session";
import { listSuggestions } from "@/platform/suggestions";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/suggestions">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ suggestions: await listSuggestions(access.agent.id, "all") });
}
