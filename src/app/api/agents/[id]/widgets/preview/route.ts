import { z } from "zod";
import { WIDGET_TEMPLATES, renderWidget } from "@/core/widgets";
import { widgetMapping } from "@/platform/agent-input";
import { apiAgent } from "@/platform/session";

/** The widget drawn from a sample response, while it's being designed. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/widgets/preview">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ template: z.enum(WIDGET_TEMPLATES), mapping: widgetMapping, sample: z.string().max(20_000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Check the widget's settings." }, { status: 400 });
  let sample: unknown;
  try {
    sample = JSON.parse(parsed.data.sample || "null");
  } catch {
    return Response.json({ error: "The example response isn't valid JSON." }, { status: 400 });
  }
  const widget = renderWidget(parsed.data, sample);
  return Response.json(widget ? { widget } : { error: "Nothing to show: check the paths match the example response." });
}
