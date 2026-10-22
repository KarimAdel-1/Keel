import { removeMember } from "@/platform/invites";
import { apiUser } from "@/platform/session";

/** Takes someone out of the workspace (owners and admins; the owner can't be removed). */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/members/[userId]">) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  if (who.workspace.role === "member") return Response.json({ error: "Only the workspace's owner or an admin can remove people." }, { status: 403 });
  const { userId } = await params;
  if (userId === who.user.id) return Response.json({ error: "You can't remove yourself." }, { status: 400 });
  if (!(await removeMember(who.workspace.id, userId))) return Response.json({ error: "That person can't be removed." }, { status: 400 });
  return Response.json({ ok: true });
}
