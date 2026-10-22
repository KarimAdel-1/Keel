import { z } from "zod";
import { apiAgent } from "@/platform/session";
import { runTests } from "@/platform/tests";
import { limitReached } from "@/platform/usage";

/** Runs tests (each `times` times) in the background, as one batch. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/tests/run">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ testIds: z.array(z.string().max(80)).min(1, "Choose tests to run.").max(100), times: z.number().int().min(1).max(20).default(1) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose tests to run." }, { status: 400 });
  const limit = await limitReached(access.agent.workspaceId);
  if (limit) return Response.json({ error: limit }, { status: 403 });
  return Response.json({ batchId: await runTests(access.agent.id, parsed.data.testIds, parsed.data.times) }, { status: 202 });
}
