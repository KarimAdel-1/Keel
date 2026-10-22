import { z } from "zod";
import { applyTodoFix, todos } from "@/platform/setup";
import { apiAgent } from "@/platform/session";
import { getAgent } from "@/platform/store";
import { saveVersion } from "@/platform/versions";

const FIXES = ["reach_person", "spam", "go_live", "write_tests"] as const;

/** Makes a one-click fix from the agent's to-do list, and returns the list as it is now. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/todos">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ fix: z.enum(FIXES) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That fix doesn't exist." }, { status: 400 });
  try {
    await applyTodoFix(access.agent, parsed.data.fix);
  } catch (error) {
    return Response.json({ error: `That couldn't be done just now: ${(error as Error).message}` }, { status: 502 });
  }
  if (parsed.data.fix !== "write_tests") await saveVersion(access.agent.id, { label: "Fixed from the to-do list", origin: "change", authorId: access.user.id });
  return Response.json({ todos: await todos((await getAgent(access.agent.id))!) });
}
