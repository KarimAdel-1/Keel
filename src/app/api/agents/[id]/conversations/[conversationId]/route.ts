import { z } from "zod";
import { apiAgent } from "@/platform/session";
import { conversationAgent, deleteConversation, setConversationStatus } from "@/platform/store";

async function access(params: RouteContext<"/api/agents/[id]/conversations/[conversationId]">["params"]) {
  const { id, conversationId } = await params;
  const who = await apiAgent(id);
  if (who instanceof Response) return who;
  if ((await conversationAgent(conversationId)) !== who.agent.id) return Response.json({ error: "That conversation doesn't exist." }, { status: 404 });
  return conversationId;
}

/** Resumes a paused conversation, or closes one. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]/conversations/[conversationId]">) {
  const conversationId = await access(params);
  if (conversationId instanceof Response) return conversationId;
  const parsed = z.object({ status: z.enum(["open", "closed"]) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Say open or closed." }, { status: 400 });
  await setConversationStatus(conversationId, parsed.data.status);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/conversations/[conversationId]">) {
  const conversationId = await access(params);
  if (conversationId instanceof Response) return conversationId;
  await deleteConversation(conversationId);
  return Response.json({ ok: true });
}
