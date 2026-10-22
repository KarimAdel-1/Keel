import { z } from "zod";
import { firstProblem } from "@/platform/agent-input";
import { listProcedures, saveProcedure } from "@/platform/procedures";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/procedures">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ procedures: await listProcedures(access.agent.id) });
}

const Body = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1, "Give the procedure a name.").max(80),
  trigger: z.string().trim().min(10, "Say when it applies, in a sentence.").max(500),
  steps: z.string().trim().min(5, "Write at least one step.").max(6000),
  enabled: z.boolean().optional(),
});

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/procedures">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const procedure = (await saveProcedure(access.agent.id, parsed.data));
  await saveVersion(access.agent.id, { label: `${parsed.data.id ? "Changed" : "Added"} the procedure "${procedure.name}"`, origin: "change", authorId: access.user.id });
  return Response.json({ procedure }, { status: 201 });
}
