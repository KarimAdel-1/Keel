import { z } from "zod";
import { qaText } from "@/core/agents";
import { firstProblem } from "@/platform/agent-input";
import { queueTraining } from "@/platform/knowledge/jobs";
import { apiAgent } from "@/platform/session";
import { deleteSource, getSource, sourceContent, updateSourceContent } from "@/platform/store";

type Context = RouteContext<"/api/agents/[id]/sources/[sourceId]">;

async function access(context: Context) {
  const { id, sourceId } = await context.params;
  const found = await apiAgent(id);
  if (found instanceof Response) return found;
  const source = (await getSource(sourceId));
  if (!source || source.agentId !== found.agent.id) return Response.json({ error: "That source doesn't exist." }, { status: 404 });
  return source;
}

/** A source with its full text, to read or edit. */
export async function GET(_request: Request, context: Context) {
  const source = await access(context);
  if (source instanceof Response) return source;
  return Response.json({ source, content: await sourceContent(source.id) });
}

const Change = z.union([
  z.object({ retrain: z.literal(true) }),
  z.object({ question: z.string().trim().min(3, "Write the question.").max(500), answer: z.string().trim().min(1, "Write the answer.").max(10_000) }),
  z.object({ title: z.string().trim().min(1, "Give it a title.").max(200), content: z.string().trim().min(20, "Add a little more text.").max(500_000) }),
]);

/** Edits a text or a Q&A pair (and trains it again), or trains any source again. */
export async function PATCH(request: Request, context: Context) {
  const source = await access(context);
  if (source instanceof Response) return source;
  const parsed = Change.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const change = parsed.data;
  if ("retrain" in change) {
    await queueTraining(source.id);
  } else if ("question" in change) {
    if (source.kind !== "qa") return Response.json({ error: "Only a Q&A source has a question." }, { status: 400 });
    if ((await updateSourceContent(source.id, { title: change.question, content: qaText(change.question, change.answer) }))) await queueTraining(source.id);
  } else {
    if (source.kind !== "text") return Response.json({ error: "Only typed text can be edited here. Upload a new version of a file instead." }, { status: 400 });
    if ((await updateSourceContent(source.id, change))) await queueTraining(source.id);
  }
  return Response.json({ source: await getSource(source.id) });
}

export async function DELETE(_request: Request, context: Context) {
  const source = await access(context);
  if (source instanceof Response) return source;
  await deleteSource(source.id);
  return Response.json({ ok: true });
}
