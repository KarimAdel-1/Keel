import { z } from "zod";
import { normalUrl } from "@/core/agents";
import { apiAgent } from "@/platform/session";
import { WEBHOOK_EVENTS, createWebhook, listWebhooks } from "@/platform/webhooks";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/webhooks">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ webhooks: await listWebhooks(access.agent.id) });
}

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/webhooks">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ url: z.string().max(2000), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event.") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the webhook." }, { status: 400 });
  const url = normalUrl(parsed.data.url);
  if (!url) return Response.json({ error: "That doesn't look like a web address." }, { status: 400 });
  return Response.json(await createWebhook(access.agent.id, url, parsed.data.events), { status: 201 });
}
