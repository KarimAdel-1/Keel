import { z } from "zod";
import type { ActionConfigs } from "@/core/actions";
import { callApi, getAction } from "@/platform/actions";
import { apiAgent } from "@/platform/session";

/** Calls an API action's endpoint for real with example values, to check it works before the agent uses it. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/actions/[actionId]/test">) {
  const { id, actionId } = await params;
  const found = await apiAgent(id);
  if (found instanceof Response) return found;
  const action = (await getAction(actionId));
  if (!action || action.agentId !== found.agent.id || action.kind !== "api") return Response.json({ error: "Only an API action can be tested this way." }, { status: 400 });
  const parsed = z.object({ args: z.record(z.string(), z.unknown()) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Give example values for the parameters." }, { status: 400 });
  try {
    const started = Date.now();
    const { status, body } = await callApi(action.config as ActionConfigs["api"], parsed.data.args);
    return Response.json({ status, body, ms: Date.now() - started });
  } catch (error) {
    const reason = (error as Error).name === "TimeoutError" ? "It took more than 10 seconds to answer." : /private|not allowed/i.test((error as Error).message) ? "That address is on a private network, which actions can't reach." : "It couldn't be reached. Check the URL.";
    return Response.json({ error: reason }, { status: 502 });
  }
}
