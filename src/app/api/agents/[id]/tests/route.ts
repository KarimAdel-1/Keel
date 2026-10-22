import { z } from "zod";
import { firstProblem } from "@/platform/agent-input";
import { apiAgent } from "@/platform/session";
import { batches, latestRuns, listRuns, listTests, saveTest } from "@/platform/tests";

/** The agent's tests with their latest results, and recent batches of runs (with one batch's runs, given ?batch=). */
export async function GET(request: Request, { params }: RouteContext<"/api/agents/[id]/tests">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const latest = (await latestRuns(access.agent.id));
  const batchId = new URL(request.url).searchParams.get("batch");
  return Response.json({
    tests: (await listTests(access.agent.id)).map((t) => ({ ...t, latest: latest.get(t.id) ?? null })),
    batches: await batches(access.agent.id),
    ...(batchId ? { runs: await listRuns(access.agent.id, { batchId, limit: 500 }) } : {}),
  });
}

const Body = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1, "Give the test a name.").max(120),
  persona: z.string().trim().min(10, "Describe the AI customer: who they are and what they want.").max(2000),
  criterion: z.string().trim().min(10, "Say what the agent must do for the test to pass.").max(1000),
  expectedActions: z.array(z.string().max(40)).max(10).default([]),
  actionResponses: z.record(z.string(), z.unknown()).default({}),
  maxTurns: z.number().int().min(1).max(20).default(6),
  opening: z.string().max(20_000).optional(),
});

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/tests">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  return Response.json({ test: await saveTest(access.agent.id, parsed.data) }, { status: 201 });
}
