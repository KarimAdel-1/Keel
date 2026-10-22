import { receiveWebhook, verifyWebhook } from "@/platform/integrations";

/**
 * Where a messaging app delivers customers' messages for one connection. Public: the platform proves itself (Meta's
 * signature, Telegram's secret header), and the connection says which business the messages are for.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/integrations/[integrationId]/webhook">) {
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response(null, { status: 413 });
  const status = await receiveWebhook((await params).integrationId, raw, request.headers);
  return new Response(null, { status });
}

/** Meta's check when the business saves the webhook address in its app: the verify token, and the challenge echoed back. */
export async function GET(request: Request, { params }: RouteContext<"/api/integrations/[integrationId]/webhook">) {
  const q = new URL(request.url).searchParams;
  const challenge = await verifyWebhook((await params).integrationId, q.get("hub.mode"), q.get("hub.verify_token"), q.get("hub.challenge"));
  return challenge ? new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } }) : new Response("Forbidden", { status: 403 });
}
