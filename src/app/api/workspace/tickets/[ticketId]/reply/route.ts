import { z } from "zod";
import { replyAsTeam } from "@/platform/helpdesk";
import { apiTicket as ticketFor } from "@/platform/session";

/** A reply from the team: it appears in the customer's chat. */
export async function POST(request: Request, { params }: RouteContext<"/api/workspace/tickets/[ticketId]/reply">) {
  const found = await ticketFor((await params).ticketId);
  if (found instanceof Response) return found;
  const parsed = z.object({ body: z.string().trim().min(1, "Write a reply.").max(8000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Write a reply." }, { status: 400 });
  await replyAsTeam(found.ticket.id, parsed.data.body, found.who.user);
  return Response.json({ ok: true });
}
