import { revokeInvite } from "@/platform/invites";
import { apiUser } from "@/platform/session";

/** Withdraws an invitation. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/invites/[inviteId]">) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  if (who.workspace.role === "member") return Response.json({ error: "Only the workspace's owner or an admin can withdraw invitations." }, { status: 403 });
  await revokeInvite(who.workspace.id, (await params).inviteId);
  return Response.json({ ok: true });
}
