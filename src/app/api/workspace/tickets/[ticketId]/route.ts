import { z } from "zod";
import { TICKET_STATUSES, assign, getTicket, setStatus } from "@/platform/helpdesk";
import { apiTicket as ticketFor } from "@/platform/session";


/** Changes a ticket's status, or who has it. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/workspace/tickets/[ticketId]">) {
  const found = await ticketFor((await params).ticketId);
  if (found instanceof Response) return found;
  const parsed = z.object({ status: z.enum(TICKET_STATUSES).optional(), assignToMe: z.boolean().optional(), unassign: z.boolean().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Check the change." }, { status: 400 });
  if (parsed.data.status) await setStatus(found.ticket.id, parsed.data.status, found.who.user.id);
  if (parsed.data.assignToMe) await assign(found.ticket.id, found.who.user.id, found.who.user.id);
  if (parsed.data.unassign) await assign(found.ticket.id, null, found.who.user.id);
  return Response.json({ ticket: await getTicket(found.ticket.id) });
}
