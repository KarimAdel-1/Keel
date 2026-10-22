import { z } from "zod";
import { contactFields, setContactFields } from "@/platform/contacts";
import { apiUser } from "@/platform/session";

export async function GET() {
  const who = await apiUser();
  if (who instanceof Response) return who;
  return Response.json({ fields: await contactFields(who.workspace.id) });
}

/** The workspace's custom contact fields. */
export async function PUT(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const parsed = z
    .object({ fields: z.array(z.object({ key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "Field keys use lowercase letters, digits and _."), label: z.string().trim().min(1).max(60) })).max(30) })
    .safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the fields." }, { status: 400 });
  await setContactFields(who.workspace.id, parsed.data.fields);
  return Response.json({ ok: true });
}
