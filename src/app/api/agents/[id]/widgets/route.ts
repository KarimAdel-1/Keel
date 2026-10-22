import { z } from "zod";
import { WIDGET_TEMPLATES } from "@/core/widgets";
import { firstProblem, widgetMapping } from "@/platform/agent-input";
import { apiAgent } from "@/platform/session";
import { listWidgets, saveWidget } from "@/platform/widgets";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/widgets">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ widgets: await listWidgets(access.agent.id) });
}


const Body = z.object({ id: z.string().max(80).optional(), template: z.enum(WIDGET_TEMPLATES), name: z.string().trim().min(1, "Give the widget a name.").max(80), mapping: widgetMapping, sample: z.string().max(20_000) });

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/widgets">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  return Response.json({ widget: await saveWidget(access.agent.id, parsed.data) }, { status: 201 });
}
