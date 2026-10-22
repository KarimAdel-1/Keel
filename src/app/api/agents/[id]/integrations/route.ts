import { z } from "zod";
import { INTEGRATION_KINDS } from "@/core/integrations";
import { publicUrl } from "@/lib/public-url";
import { listIntegrations, saveIntegration, viewOf } from "@/platform/integrations";
import { apiAgent } from "@/platform/session";

/** The apps and tools connected to an agent, secrets masked. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/integrations">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const base = await publicUrl();
  return Response.json({ integrations: (await listIntegrations(access.agent.id)).map((i) => viewOf(i, base)) });
}

const Body = z.object({ kind: z.enum(INTEGRATION_KINDS), config: z.record(z.string(), z.string().max(4000)) });

/** Connects an app or a tool: its keys are checked with the platform first. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/integrations">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose what to connect and fill in its details." }, { status: 400 });
  const base = await publicUrl();
  const saved = await saveIntegration(access.agent.id, parsed.data, base);
  if ("error" in saved) return Response.json(saved, { status: 400 });
  return Response.json({ integration: viewOf(saved.integration, base) }, { status: 201 });
}
