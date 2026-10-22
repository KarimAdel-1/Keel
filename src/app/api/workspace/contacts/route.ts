import { z } from "zod";
import { listContacts, upsertContact } from "@/platform/contacts";
import { apiUser } from "@/platform/session";

export async function GET(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const url = new URL(request.url);
  return Response.json(await listContacts(who.workspace.id, { search: url.searchParams.get("q") ?? undefined, limit: 50, offset: Number(url.searchParams.get("offset") ?? 0) || 0 }));
}

const Body = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.union([z.literal(""), z.string().trim().email("That email address doesn't look right.")]).optional(),
  phone: z.string().trim().max(40).optional(),
  externalId: z.string().trim().max(120).optional(),
  attributes: z.record(z.string(), z.string().max(2000)).optional(),
});

export async function POST(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the contact." }, { status: 400 });
  if (!parsed.data.name && !parsed.data.email && !parsed.data.phone) return Response.json({ error: "Give at least a name, an email or a phone number." }, { status: 400 });
  return Response.json({ contact: await upsertContact({ workspaceId: who.workspace.id, ...parsed.data, email: parsed.data.email || undefined }) }, { status: 201 });
}
