import { db } from "@/lib/db";
import { json } from "@/lib/rows";
import { hasOpenTicket } from "@/platform/helpdesk";
import { visitorAgent } from "@/platform/session";
import { conversationAgent } from "@/platform/store";

/**
 * Replies from the business's team after message `after`, while a person has the conversation or a ticket is open for
 * it. Polled by the chat.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/chat/[id]/messages">) {
  const { id } = await params;
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") ?? "";
  const after = Number(url.searchParams.get("after") ?? 0) || 0;
  if (!conversationId || !(await visitorAgent(id)) || (await conversationAgent(conversationId)) !== id) return Response.json({ messages: [], withTeam: false }, { status: 404 });
  const rows = await db().prepare("SELECT id, content, meta FROM messages WHERE conversation_id = ? AND role = 'human' AND id > ? ORDER BY id LIMIT 50").all<{ id: number; content: string; meta: string }>(conversationId, after);
  const status = (await db().prepare("SELECT status FROM conversations WHERE id = ?").get<{ status?: string }>(conversationId))?.status;
  return Response.json({ messages: rows.map((r) => ({ id: r.id, content: r.content, author: json<{ author?: string }>(r.meta, {}).author })), withTeam: status === "handed_off", ticketOpen: await hasOpenTicket(conversationId) });
}
