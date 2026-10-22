import { z } from "zod";
import { LEAD_FIELDS, type ActionConfigs } from "@/core/actions";
import { getAction } from "@/platform/actions";
import { apiAgent, visitorAgent } from "@/platform/session";
import { conversationAgent } from "@/platform/store";
import { addSubmission, checkAnswers } from "@/platform/submissions";
import { db } from "@/lib/db";

const Body = z.object({ conversationId: z.string().max(80).optional(), actionId: z.string().max(80), answers: z.record(z.string(), z.string().max(4000)) });

/** A form shown in the chat, filled in: a lead, collected data or a custom form, kept with its conversation. */
export async function POST(request: Request, { params }: RouteContext<"/api/chat/[id]/forms">) {
  const agent = await visitorAgent((await params).id);
  if (!agent) return Response.json({ error: "This chat isn't available right now." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  const { conversationId, actionId, answers } = parsed.data;
  const conversation = conversationId && (await conversationAgent(conversationId)) === agent.id ? conversationId : undefined;
  const channel = conversation ? (await db().prepare("SELECT channel FROM conversations WHERE id = ?").get<{ channel?: string }>(conversation))?.channel : undefined;
  // The builder's test chat works while the agent is off; visitors need it on.
  if (channel === "playground" || !agent.enabled) {
    const access = await apiAgent(agent.id);
    if (access instanceof Response) return Response.json({ error: "This chat isn't available right now." }, { status: 404 });
  }
  const action = await getAction(actionId);
  if (!action || action.agentId !== agent.id || !["lead", "data", "form"].includes(action.kind)) return Response.json({ error: "This form is no longer available." }, { status: 404 });
  const fields = action.kind === "lead" ? (action.config as ActionConfigs["lead"]).fields.map((f) => LEAD_FIELDS[f]) : (action.config as ActionConfigs["data"]).fields;
  const checked = checkAnswers(fields, answers);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
  await addSubmission({ agentId: agent.id, actionId, conversationId: conversation, kind: action.kind as "lead" | "data" | "form", data: checked.data });
  return Response.json({ ok: true }, { status: 201 });
}
