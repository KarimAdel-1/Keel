import { deleteContact, getContact } from "@/platform/contacts";
import { apiUser } from "@/platform/session";

export async function DELETE(_request: Request, { params }: RouteContext<"/api/workspace/contacts/[contactId]">) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const contact = (await getContact((await params).contactId));
  if (!contact || contact.workspaceId !== who.workspace.id) return Response.json({ error: "That contact doesn't exist." }, { status: 404 });
  await deleteContact(contact.id);
  return Response.json({ ok: true });
}
