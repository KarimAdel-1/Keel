import { apiAgent } from "@/platform/session";
import { deleteWidget } from "@/platform/widgets";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/widgets/[widgetId]">) {
  const { id, widgetId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  await deleteWidget(access.agent.id, widgetId);
  return Response.json({ ok: true });
}
