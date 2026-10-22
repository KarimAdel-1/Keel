import { z } from "zod";
import { AccountError } from "@/platform/accounts";
import { acceptInvite } from "@/platform/invites";
import { chooseWorkspace, currentUser } from "@/platform/session";

/** Joins the invitation's workspace (signed in), and makes it the current one. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in first." }, { status: 401 });
  const parsed = z.object({ token: z.string().min(10).max(200) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That invitation link isn't complete." }, { status: 400 });
  try {
    const invite = (await acceptInvite(parsed.data.token, user.id));
    await chooseWorkspace(invite.workspaceId);
    return Response.json({ ok: true, workspace: invite.workspaceName });
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
