import { z } from "zod";
import { apiAgent } from "@/platform/session";
import { updateAgent } from "@/platform/store";

/** Skips a getting-started step, or brings it back. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]/setup">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ step: z.string().max(40), skip: z.boolean() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Which step?" }, { status: 400 });
  const skipped = new Set(access.agent.config.setupSkipped);
  if (parsed.data.skip) skipped.add(parsed.data.step);
  else skipped.delete(parsed.data.step);
  await updateAgent(access.agent.id, { config: { setupSkipped: [...skipped] } });
  return Response.json({ ok: true });
}
