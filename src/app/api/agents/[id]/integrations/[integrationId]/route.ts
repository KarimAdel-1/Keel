import { z } from "zod";
import { INTEGRATION_KINDS } from "@/core/integrations";
import { publicUrl } from "@/lib/public-url";
import { deleteIntegration, getIntegration, saveIntegration, setIntegrationEnabled, viewOf } from "@/platform/integrations";
import { apiAgent } from "@/platform/session";

const Change = z.object({ kind: z.enum(INTEGRATION_KINDS).optional(), config: z.record(z.string(), z.string().max(4000)).optional(), enabled: z.boolean().optional() });

/** Turns a connection on or off, or changes its keys (checked with the platform again). */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]/integrations/[integrationId]">) {
  const { id, integrationId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const existing = await getIntegration(integrationId);
  if (!existing || existing.agentId !== access.agent.id) return Response.json({ error: "That connection doesn't exist." }, { status: 404 });
  const parsed = Change.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That change isn't valid." }, { status: 400 });
  const base = await publicUrl();
  if (parsed.data.config) {
    const saved = await saveIntegration(access.agent.id, { id: existing.id, kind: existing.kind, config: parsed.data.config, ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}) }, base);
    if ("error" in saved) return Response.json(saved, { status: 400 });
    return Response.json({ integration: viewOf(saved.integration, base) });
  }
  if (parsed.data.enabled !== undefined) await setIntegrationEnabled(existing.id, parsed.data.enabled);
  return Response.json({ integration: viewOf((await getIntegration(existing.id))!, base) });
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/integrations/[integrationId]">) {
  const { id, integrationId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const existing = await getIntegration(integrationId);
  if (!existing || existing.agentId !== access.agent.id) return Response.json({ error: "That connection doesn't exist." }, { status: 404 });
  await deleteIntegration(existing.id);
  return Response.json({ ok: true });
}
