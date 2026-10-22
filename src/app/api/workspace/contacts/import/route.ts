import { importContacts } from "@/platform/contacts";
import { apiUser } from "@/platform/session";

/** Contacts from a CSV file (a header row, then one contact per row). */
export async function POST(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const form = await request.formData().catch(() => undefined);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a CSV file." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Use a file under 5 MB." }, { status: 400 });
  return Response.json(await importContacts(who.workspace.id, await file.text()));
}
