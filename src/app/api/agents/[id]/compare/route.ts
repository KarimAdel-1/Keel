import { z } from "zod";
import { modelFor } from "@/lib/models";
import { configChange, firstProblem, withChanges } from "@/platform/agent-input";
import { reply } from "@/platform/chat/answer";
import { apiAgent } from "@/platform/session";
import { metered } from "@/platform/usage";

const Body = z.object({ message: z.string().trim().min(1, "Write a question to compare.").max(2000), a: configChange, b: configChange });

/** The same question answered by two versions of the agent's settings, side by side. Nothing is saved. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/compare">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const { message, a, b } = parsed.data;
  const run = async (change: typeof a) => {
    const agent = { ...access.agent, config: withChanges(access.agent.config, change) };
    return metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "compare" }, async (meter) => {
      const r = await reply(agent, [], message, { test: { responses: {} } });
      return { text: r.text, citations: r.citations, model: modelFor(r.model).name, tokens: meter.inputTokens + meter.outputTokens, confidence: r.confidence, actions: r.actions.map((x) => x.name) };
    });
  };
  const [left, right] = await Promise.all([run(a), run(b)]);
  return Response.json({ a: left, b: right });
}
