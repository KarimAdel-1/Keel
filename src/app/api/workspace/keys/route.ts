import { z } from "zod";
import { createKey, listKeys } from "@/platform/apikeys";
import { apiUser } from "@/platform/session";

export async function GET() {
  const who = await apiUser();
  if (who instanceof Response) return who;
  return Response.json({ keys: await listKeys(who.workspace.id) });
}

/** Makes an API key; the key itself is returned only now. */
export async function POST(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const parsed = z.object({ name: z.string().trim().min(1, "Name the key, so you know where it's used.").max(80) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  return Response.json(await createKey(who.workspace.id, parsed.data.name), { status: 201 });
}
