import { analyzeConversations } from "@/platform/analysis";
import { apiAgent } from "@/platform/session";

/** Reads the agent's finished conversations for sentiment and topics. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/analyze">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ read: await analyzeConversations(access.agent.id, 100) });
}
