import { z } from "zod";
import { ACTION_KINDS } from "@/core/actions";
import { LIMITS } from "@/core/limits";
import { createAction, listActions, maskedAction } from "@/platform/actions";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/actions">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ actions: (await listActions(access.agent.id)).map(maskedAction) });
}

const Body = z.object({ kind: z.enum(ACTION_KINDS) });

/** Adds an action of a kind, with its starting settings, ready to edit. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/actions">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose a kind of action." }, { status: 400 });
  if ((await listActions(access.agent.id)).length >= LIMITS.actionsPerAgent) return Response.json({ error: `An agent can have ${LIMITS.actionsPerAgent} actions; with more, it chooses among them less reliably. Remove one to add another.` }, { status: 400 });
  const action = (await createAction(access.agent.id, parsed.data.kind));
  await saveVersion(access.agent.id, { label: `Added the action "${action.title}"`, origin: "change", authorId: access.user.id });
  return Response.json({ action: maskedAction(action) }, { status: 201 });
}
