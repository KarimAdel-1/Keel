import { apiAgent } from "@/platform/session";
import { deleteConversations } from "@/platform/store";

/** Deletes all of the agent's conversations (Settings › Danger zone). */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/conversations">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ deleted: await deleteConversations(access.agent.id) });
}
