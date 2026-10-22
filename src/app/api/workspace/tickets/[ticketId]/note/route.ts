import { z } from "zod";
import { addNote } from "@/platform/helpdesk";
import { apiTicket as ticketFor } from "@/platform/session";

/** An internal note: only the team sees it. */
export async function POST(request: Request, { params }: RouteContext<"/api/workspace/tickets/[ticketId]/note">) {
  const found = await ticketFor((await params).ticketId);
  if (found instanceof Response) return found;
  const parsed = z.object({ body: z.string().trim().min(1, "Write a note.").max(8000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Write a note." }, { status: 400 });
  await addNote(found.ticket.id, parsed.data.body, found.who.user.id);
  return Response.json({ ok: true });
}
