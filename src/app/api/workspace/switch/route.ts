import { z } from "zod";
import { workspacesOf } from "@/platform/accounts";
import { chooseWorkspace, currentUser } from "@/platform/session";

/** Switches to another of the person's workspaces. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = z.object({ workspaceId: z.string().max(80) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !(await workspacesOf(user.id)).some((w) => w.id === parsed.data.workspaceId)) return Response.json({ error: "That workspace isn't yours." }, { status: 404 });
  await chooseWorkspace(parsed.data.workspaceId);
  return Response.json({ ok: true });
}
