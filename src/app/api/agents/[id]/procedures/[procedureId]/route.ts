import { deleteProcedure } from "@/platform/procedures";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/procedures/[procedureId]">) {
  const { id, procedureId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  await deleteProcedure(access.agent.id, procedureId);
  await saveVersion(access.agent.id, { label: "Removed a procedure", origin: "change", authorId: access.user.id });
  return Response.json({ ok: true });
}
