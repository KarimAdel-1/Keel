import { z } from "zod";
import { publicUrl } from "@/lib/public-url";
import { createInvite, pendingInvites } from "@/platform/invites";
import { apiUser } from "@/platform/session";
import { setting } from "@/lib/settings";

/** The workspace's open invitations. */
export async function GET() {
  const who = await apiUser();
  if (who instanceof Response) return who;
  return Response.json({ invites: await pendingInvites(who.workspace.id) });
}

/** Makes an invitation link (owners and admins). The link is shown only now. */
export async function POST(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  if (who.workspace.role === "member") return Response.json({ error: "Only the workspace's owner or an admin can invite people." }, { status: 403 });
  if (setting("KEEL_PRIVATE")) return Response.json({ error: "Invitations are off on this private server." }, { status: 403 });
  const parsed = z.object({ role: z.enum(["admin", "member"]).default("member") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose a role." }, { status: 400 });
  const { token, invite } = await createInvite(who.workspace.id, parsed.data.role, who.user.id);
  return Response.json({ invite, link: `${await publicUrl()}/invite/${token}` }, { status: 201 });
}
