import { z } from "zod";
import { PROCEDURE_TEMPLATES } from "@/core/procedures";
import { createAction, listActions } from "@/platform/actions";
import { saveProcedure } from "@/platform/procedures";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

/** Adds a procedure from a template, with any action its steps need that the agent doesn't have yet. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/procedures/templates">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ index: z.number().int().min(0) }).safeParse(await request.json().catch(() => ({})));
  const template = parsed.success ? PROCEDURE_TEMPLATES[parsed.data.index] : undefined;
  if (!template) return Response.json({ error: "That template doesn't exist." }, { status: 404 });
  const have = new Set((await listActions(access.agent.id)).map((a) => a.name));
  const created = [];
  for (const n of template.needs.filter((x) => !have.has(x.name))) created.push(await createAction(access.agent.id, n.kind, { name: n.name }));
  const procedure = await saveProcedure(access.agent.id, { name: template.name, trigger: template.trigger, steps: template.steps });
  await saveVersion(access.agent.id, { label: `Added the procedure "${procedure.name}" from a template`, origin: "change", authorId: access.user.id });
  return Response.json({ procedure, createdActions: created.map((a) => a.title) }, { status: 201 });
}
