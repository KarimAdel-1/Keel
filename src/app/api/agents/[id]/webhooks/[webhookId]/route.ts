import { apiAgent } from "@/platform/session";
import { deleteWebhook } from "@/platform/webhooks";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/webhooks/[webhookId]">) {
  const { id, webhookId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  await deleteWebhook(access.agent.id, webhookId);
  return Response.json({ ok: true });
}
