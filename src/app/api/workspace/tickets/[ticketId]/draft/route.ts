import { draftTeamReply } from "@/platform/helpdesk-draft";
import { apiTicket as ticketFor } from "@/platform/session";

/** A reply drafted for the team member to read, change and send. */
export async function POST(_request: Request, { params }: RouteContext<"/api/workspace/tickets/[ticketId]/draft">) {
  const found = await ticketFor((await params).ticketId);
  if (found instanceof Response) return found;
  try {
    return Response.json({ draft: await draftTeamReply(found.ticket.id, found.who.user.name) });
  } catch {
    return Response.json({ error: "A draft couldn't be written just now." }, { status: 502 });
  }
}
