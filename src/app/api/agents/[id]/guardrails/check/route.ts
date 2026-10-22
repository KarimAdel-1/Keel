import { z } from "zod";
import { mergeConfig } from "@/core/agents";
import { configChange } from "@/platform/agent-input";
import { checkRails } from "@/lib/rails";
import { apiAgent } from "@/platform/session";
import { metered } from "@/platform/usage";

const Body = z.object({
  type: z.enum(["input", "output"]),
  message: z.string().trim().min(1, "Write a message to check.").max(4000),
  reply: z.string().trim().max(4000).optional(),
  /** Unsaved guardrails settings to try instead of the saved ones. */
  change: configChange.optional(),
});

/** Tries the agent's NVIDIA NeMo Guardrails on a message (or a reply), with its saved or unsaved settings. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/guardrails/check">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Write a message to check." }, { status: 400 });
  const { type, message, reply, change } = parsed.data;
  const config = mergeConfig(access.agent.config, change);
  const agent = { ...access.agent, config: { ...config, protection: { ...config.protection, nemo: { ...config.protection.nemo, enabled: true, [type]: true } } } };
  try {
    const result = await metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "guardrails" }, () => checkRails(agent, type, message, type === "output" ? (reply ?? "") : undefined));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 503 });
  }
}
