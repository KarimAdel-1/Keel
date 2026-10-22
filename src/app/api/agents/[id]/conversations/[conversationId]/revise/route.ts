import { z } from "zod";
import { qaText } from "@/core/agents";
import { queueTraining } from "@/platform/knowledge/jobs";
import { apiAgent } from "@/platform/session";
import { addSource, conversationAgent, conversationMessages } from "@/platform/store";

/** "Revise answer": the right answer to a question in a conversation, kept as a Q&A so the agent answers it that way next time. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/conversations/[conversationId]/revise">) {
  const { id, conversationId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  if ((await conversationAgent(conversationId)) !== access.agent.id) return Response.json({ error: "That conversation doesn't exist." }, { status: 404 });
  const parsed = z.object({ messageId: z.number().int(), question: z.string().trim().min(2).max(500).optional(), answer: z.string().trim().min(2, "Write the better answer.").max(10_000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Write the better answer." }, { status: 400 });
  const messages = (await conversationMessages(conversationId));
  const index = messages.findIndex((m) => m.id === parsed.data.messageId);
  const question = parsed.data.question ?? [...messages.slice(0, index)].reverse().find((m) => m.role === "user")?.content;
  if (!question) return Response.json({ error: "Write the question this answers." }, { status: 400 });
  const source = (await addSource(access.agent.id, { kind: "qa", title: question.slice(0, 200), content: qaText(question, parsed.data.answer) }));
  await queueTraining(source.id);
  return Response.json({ source }, { status: 201 });
}
