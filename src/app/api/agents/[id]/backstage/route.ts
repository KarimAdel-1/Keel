import { z } from "zod";
import { backstageMessages, clearBackstage } from "@/platform/backstage";
import { askCopilot } from "@/platform/copilot";
import { apiAgent, browserThread } from "@/platform/session";

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/backstage">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ messages: await backstageMessages(access.agent.id, await browserThread()) });
}

export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/backstage">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ message: z.string().trim().min(1).max(4000) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Write a message." }, { status: 400 });
  try {
    return Response.json({ message: await askCopilot(access.agent, parsed.data.message, access.user.id, await browserThread()) });
  } catch {
    return Response.json({ error: "The Copilot couldn't answer just now. Try again in a moment." }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/agents/[id]/backstage">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  await clearBackstage(access.agent.id, await browserThread());
  return Response.json({ ok: true });
}
