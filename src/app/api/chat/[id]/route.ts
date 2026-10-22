import { z } from "zod";
import { CHAT_LAYOUTS } from "@/core/agents";
import { eventStream } from "@/lib/sse";
import { setting } from "@/lib/settings";
import { firstProblem } from "@/platform/agent-input";
import { MAX_MESSAGE_CHARS, converse } from "@/platform/chat/converse";
import { pictureFromBase64 } from "@/platform/pictures";
import { allowMessage, domainAllowed } from "@/platform/chat/limits";
import { hasOpenTicket } from "@/platform/helpdesk";
import { visitorAgent } from "@/platform/session";

const Body = z.object({
  message: z.string().trim().max(MAX_MESSAGE_CHARS, "That message is too long.").default(""),
  /** A photo sent with the message, as base64 (the chat shrinks it first). */
  picture: z.string().max(12_000_000, "That photo is too large.").optional(),
  conversationId: z.string().max(80).optional(),
  /** Where the chat is: on the business's site (bubble, panel, focus window, embedded window) or the shared page. */
  channel: z.enum(["widget", "share"]).default("share"),
  layout: z.enum(CHAT_LAYOUTS).optional(),
  /** The page the chat is embedded in, for the agent's allowed websites. */
  host: z.string().max(300).optional(),
  /** A random id the visitor's browser keeps, for the per-visitor limit when the address can't be trusted. */
  visitor: z.string().max(64).optional(),
});

/** Who's sending: their address when a trusted proxy reports it, otherwise their browser's id. */
const visitorOf = (request: Request, browserId?: string) =>
  (setting("TRUST_PROXY") ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined) || (browserId ? `browser:${browserId}` : "unknown");

/** The public chat: what visitors send from the website or the chat page. The reply streams back as it's written. */
export async function POST(request: Request, { params }: RouteContext<"/api/chat/[id]">) {
  const agent = await visitorAgent((await params).id);
  if (!agent || !agent.enabled) return Response.json({ error: "This chat isn't available right now." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const { message, conversationId, channel, layout, host, visitor } = parsed.data;
  const picture = parsed.data.picture ? pictureFromBase64(parsed.data.picture) : undefined;
  if (parsed.data.picture && !picture) return Response.json({ error: "That photo couldn't be read. Send a JPEG, PNG or WebP under 8 MB." }, { status: 400 });
  if (!message && !picture) return Response.json({ error: "Write a message." }, { status: 400 });
  const protection = agent.config.protection;
  if (channel === "widget" && !domainAllowed(protection.allowedDomains, host)) return Response.json({ error: "This chat isn't available on this website." }, { status: 403 });
  const allowed = allowMessage(agent.id, visitorOf(request, visitor), protection.rateLimit);
  if (!allowed.ok) return Response.json({ error: protection.rateLimit.message }, { status: 429, headers: { "Retry-After": String(allowed.retryAfter) } });
  const showSources = agent.config.appearance.showSources;
  const country = setting("TRUST_PROXY") ? (request.headers.get("x-country-code") ?? undefined) : undefined;

  return eventStream(request, async (send, signal) => {
    const turn = await converse({ agent, channel, layout, conversationId, message, picture, signal, country, visitor, onStart: (id) => send("start", { conversationId: id }), onText: (t) => send("text", { t }) });
    const { reply } = turn;
    send("done", {
      text: reply.text,
      citations: showSources ? reply.citations.map((c) => ({ n: c.n, title: c.title, url: c.url, section: c.section, excerpt: c.excerpt })) : [],
      widgets: reply.widgets,
      followups: reply.followups,
      handedOver: reply.handedOver,
      ticketOpen: await hasOpenTicket(turn.conversationId),
      status: turn.status,
    });
  });
}
