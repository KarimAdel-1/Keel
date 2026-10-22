import { PHOTO_NOTE } from "@/core/pictures";
import { hasOpenTicket } from "@/platform/helpdesk";
import { visitorAgent } from "@/platform/session";
import { conversationMessages, conversationSummary } from "@/platform/store";

/** How long a visitor's conversation is picked up again when they open another page of the website. */
const KEEP_MS = 24 * 3_600_000;

/**
 * A visitor's conversation, to show it again on the next page of the business's website: only to the browser that
 * started it (its visitor id), and only for a day.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/chat/[id]/history">) {
  const q = new URL(request.url).searchParams;
  const conversationId = q.get("conversationId") ?? "";
  const visitor = q.get("visitor") ?? "";
  const agent = await visitorAgent((await params).id);
  const conversation = agent && conversationId ? await conversationSummary(conversationId) : undefined;
  if (!agent || !conversation || conversation.agentId !== agent.id || !visitor || conversation.meta.visitor !== visitor || Date.now() - new Date(conversation.lastAt).getTime() > KEEP_MS) {
    return Response.json({ messages: [] }, { status: 404 });
  }
  const messages = (await conversationMessages(conversationId))
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "human")
    // What a photo showed is written for the agent and the team, not shown back to the visitor.
    .map((m) => ({ id: m.id, role: m.role, text: m.role === "user" ? m.content.replace(PHOTO_NOTE, "").trim() || "(A photo)" : m.content, ...(m.role === "human" && typeof m.meta.author === "string" ? { author: m.meta.author } : {}) }));
  return Response.json({ messages, withTeam: conversation.status === "handed_off", ticketOpen: await hasOpenTicket(conversationId) });
}
