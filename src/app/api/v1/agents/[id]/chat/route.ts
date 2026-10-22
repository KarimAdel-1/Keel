import { z } from "zod";
import { eventStream } from "@/lib/sse";
import { enterTenant } from "@/lib/tenant";
import { workspaceForKey } from "@/platform/apikeys";
import { MAX_MESSAGE_CHARS, converse } from "@/platform/chat/converse";
import { getAgent } from "@/platform/store";

const Body = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  conversationId: z.string().max(80).optional(),
  /** Stream the reply as server-sent events instead of one JSON answer. */
  stream: z.boolean().default(false),
});

/**
 * The REST API: send a message to an agent from your own system, with a workspace API key
 * (Authorization: Bearer keel_sk_…). Continue a conversation by sending back its conversationId.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/agents/[id]/chat">) {
  const workspaceId = await workspaceForKey(request.headers.get("authorization"));
  if (!workspaceId) return Response.json({ error: "Missing or unknown API key. Send it as: Authorization: Bearer keel_sk_…" }, { status: 401 });
  // The key says which business: only its agents can be reached.
  await enterTenant(workspaceId);
  const agent = await getAgent((await params).id);
  if (!agent || agent.workspaceId !== workspaceId) return Response.json({ error: "No agent with that id in this workspace." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Send JSON with a message (and optionally conversationId and stream)." }, { status: 400 });
  const { message, conversationId, stream } = parsed.data;
  const result = (turn: Awaited<ReturnType<typeof converse>>) => ({
    conversationId: turn.conversationId,
    status: turn.status,
    text: turn.reply.text,
    citations: turn.reply.citations.map((c) => ({ n: c.n, title: c.title, url: c.url, section: c.section })),
    confidence: turn.reply.confidence,
    actions: turn.reply.actions.map((a) => a.name),
    widgets: turn.reply.widgets,
  });
  if (!stream) return Response.json(result(await converse({ agent, channel: "api", conversationId, message, signal: request.signal })));
  return eventStream(request, async (send, signal) => {
    const turn = await converse({ agent, channel: "api", conversationId, message, signal, onStart: (id) => send("start", { conversationId: id }), onText: (t) => send("text", { t }) });
    send("done", result(turn));
  });
}
