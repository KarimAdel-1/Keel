import { z } from "zod";
import { renameWorkspace } from "@/platform/accounts";
import { apiUser } from "@/platform/session";

/** Renames the workspace (its owner and admins only). */
export async function PATCH(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  if (who.workspace.role === "member") return Response.json({ error: "Only the workspace's owner or an admin can rename it." }, { status: 403 });
  const parsed = z.object({ name: z.string().trim().min(1, "Give the workspace a name.").max(80) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Give the workspace a name." }, { status: 400 });
  await renameWorkspace(who.workspace.id, parsed.data.name);
  return Response.json({ ok: true });
}
