import { z } from "zod";
import { qaText } from "@/core/agents";
import { queueTraining } from "@/platform/knowledge/jobs";
import { apiAgent } from "@/platform/session";
import { addSource } from "@/platform/store";
import { getSuggestion, setSuggestionStatus } from "@/platform/suggestions";

const Body = z.union([z.object({ status: z.enum(["open", "resolved", "dismissed"]) }), z.object({ answer: z.string().trim().min(2, "Write the answer.").max(10_000), question: z.string().trim().max(500).optional() })]);

/** Dismisses or resolves a suggestion; for a gap, writing the answer adds it as a Q&A and resolves it. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/agents/[id]/suggestions/[suggestionId]">) {
  const { id, suggestionId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const suggestion = (await getSuggestion(suggestionId));
  if (!suggestion || suggestion.agentId !== access.agent.id) return Response.json({ error: "That suggestion doesn't exist." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Write the answer." }, { status: 400 });
  if ("answer" in parsed.data) {
    const question = parsed.data.question || suggestion.detail.questions?.[0] || suggestion.title;
    await queueTraining((await addSource(access.agent.id, { kind: "qa", title: question, content: qaText(question, parsed.data.answer) })).id);
    await setSuggestionStatus(suggestion.id, "resolved");
  } else await setSuggestionStatus(suggestion.id, parsed.data.status);
  return Response.json({ ok: true });
}
