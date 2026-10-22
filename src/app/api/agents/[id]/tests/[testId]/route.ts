import { apiAgent } from "@/platform/session";
import { deleteTest } from "@/platform/tests";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/tests/[testId]">) {
  const { id, testId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  await deleteTest(access.agent.id, testId);
  return Response.json({ ok: true });
}
