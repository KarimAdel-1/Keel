import { z } from "zod";
import { deleteAction, getAction, updateAction, maskedAction } from "@/platform/actions";
import { firstProblem } from "@/platform/agent-input";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

type Context = RouteContext<"/api/agents/[id]/actions/[actionId]">;

async function access(context: Context) {
  const { id, actionId } = await context.params;
  const found = await apiAgent(id);
  if (found instanceof Response) return found;
  const action = (await getAction(actionId));
  if (!action || action.agentId !== found.agent.id) return Response.json({ error: "That action doesn't exist." }, { status: 404 });
  return action;
}

const field = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{1,40}$/, "Field keys use lowercase letters, digits and _."),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["text", "long", "email", "phone", "number", "date", "choice"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

const Change = z.object({
  title: z.string().trim().min(1, "Give the action a name.").max(80).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().min(10, "Say when the agent should use it, in a sentence.").max(1000).optional(),
  enabled: z.boolean().optional(),
  proceduresOnly: z.boolean().optional(),
  config: z
    .object({
      confirmation: z.string().trim().max(500),
      message: z.string().trim().max(500),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      url: z.string().trim().max(2000).regex(/^https?:\/\//, "The URL must start with https:// (or http:// for testing)."),
      headers: z.array(z.object({ name: z.string().trim().max(100), value: z.string().max(2000) })).max(20),
      params: z.array(z.object({ name: z.string().trim().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,39}$/, "Parameter names use letters, digits and _."), type: z.enum(["string", "number", "boolean"]), description: z.string().trim().max(300), required: z.boolean() })).max(20),
      widgetId: z.string().max(80).optional(),
      title: z.string().trim().max(120),
      fields: z.union([z.array(z.enum(["name", "email", "phone", "company"])).min(1), z.array(field).min(1, "A form needs at least one field.").max(15)]),
      submitLabel: z.string().trim().min(1).max(40),
      label: z.string().trim().min(1).max(60),
      count: z.number().int().min(1).max(5),
    })
    .partial()
    .optional(),
});

export async function PATCH(request: Request, context: Context) {
  const action = await access(context);
  if (action instanceof Response) return action;
  const parsed = Change.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const updated = (await updateAction(action.id, parsed.data));
  await saveVersion(action.agentId, { label: `Changed the action "${updated?.title ?? action.title}"`, origin: "change" });
  return Response.json({ action: updated && maskedAction(updated) });
}

export async function DELETE(_request: Request, context: Context) {
  const action = await access(context);
  if (action instanceof Response) return action;
  await deleteAction(action.id);
  await saveVersion(action.agentId, { label: `Removed the action "${action.title}"`, origin: "change" });
  return Response.json({ ok: true });
}

