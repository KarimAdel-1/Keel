import { z } from "zod";
import { CHAT_LAYOUTS } from "@/core/agents";
import { VISION_MODEL, modelFor } from "@/lib/models";
import { eventStream } from "@/lib/sse";
import { configChange, firstProblem, withChanges } from "@/platform/agent-input";
import { MAX_MESSAGE_CHARS, converse } from "@/platform/chat/converse";
import { pictureFromBase64 } from "@/platform/pictures";
import { hasOpenTicket } from "@/platform/helpdesk";
import { apiAgent } from "@/platform/session";

const Body = z.object({
  message: z.string().trim().max(MAX_MESSAGE_CHARS, "That message is too long.").default(""),
  /** A photo sent with the message, as base64 (the chat shrinks it first). */
  picture: z.string().max(12_000_000, "That photo is too large.").optional(),
  conversationId: z.string().max(80).optional(),
  /** Unsaved changes to try before saving them. */
  preview: configChange.optional(),
  /** The channel being tried, for its own instructions. */
  layout: z.enum(CHAT_LAYOUTS).optional(),
});

/**
 * The builder's test chat: the reply streams as server-sent events (start, text pieces, done with its sources).
 * Unsaved settings can be tried through `preview`.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/chat">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const { message, conversationId, preview, layout } = parsed.data;
  const picture = parsed.data.picture ? pictureFromBase64(parsed.data.picture) : undefined;
  if (parsed.data.picture && !picture) return Response.json({ error: "That photo couldn't be read. Send a JPEG, PNG or WebP under 8 MB." }, { status: 400 });
  if (!message && !picture) return Response.json({ error: "Write a message." }, { status: 400 });
  const agent = { ...access.agent, config: withChanges(access.agent.config, preview) };

  return eventStream(request, async (send, signal) => {
    const turn = await converse({
      agent,
      channel: "playground",
      layout,
      conversationId,
      message,
      picture,
      signal,
      onStart: (id) => send("start", { conversationId: id }),
      onText: (t) => send("text", { t }),
    });
    const { reply } = turn;
    send("done", {
      text: reply.text,
      citations: reply.citations,
      model: modelFor(reply.model).name,
      ...(reply.kept ? { kept: true } : { tokens: turn.tokens }),
      confidence: reply.confidence,
      actions: reply.actions.map((a) => ({ name: a.name, error: a.error })),
      widgets: reply.widgets,
      followups: reply.followups,
      procedure: reply.procedure?.name,
      // Which model read the photo, for the builder.
      ...(picture ? { pictureModel: VISION_MODEL.name } : {}),
      ticketOpen: await hasOpenTicket(turn.conversationId),
      status: turn.status,
    });
  });
}
