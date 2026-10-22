import { domainAllowed } from "@/platform/chat/limits";
import { visitorAgent } from "@/platform/session";

const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" };

/** What the embed script needs to draw the launcher before the chat loads: colour, side, layout. Public. */
export async function GET(request: Request, { params }: RouteContext<"/api/chat/[id]/config">) {
  const agent = await visitorAgent((await params).id);
  if (!agent || !agent.enabled) return Response.json({ available: false }, { status: 404, headers: CORS });
  const origin = request.headers.get("origin");
  const host = origin ? new URL(origin).hostname : undefined;
  if (!domainAllowed(agent.config.protection.allowedDomains, host)) return Response.json({ available: false }, { status: 403, headers: CORS });
  const a = agent.config.appearance;
  return Response.json({ available: true, name: a.displayName, color: a.color, position: a.position, layout: a.layout, theme: a.theme }, { headers: CORS });
}
