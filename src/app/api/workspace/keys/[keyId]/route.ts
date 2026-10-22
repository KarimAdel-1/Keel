import { deleteKey } from "@/platform/apikeys";
import { apiUser } from "@/platform/session";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/keys/[keyId]">) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  await deleteKey(who.workspace.id, (await params).keyId);
  return Response.json({ ok: true });
}
