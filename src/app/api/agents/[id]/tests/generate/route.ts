import { z } from "zod";
import { apiAgent } from "@/platform/session";
import { generateTests } from "@/platform/tests";

/** Writes a crowd of AI customers from what the agent knows. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/tests/generate">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ count: z.number().int().min(1).max(20).default(8) }).safeParse(await request.json().catch(() => ({})));
  try {
    const tests = await generateTests(access.agent, parsed.success ? parsed.data.count : 8);
    return Response.json({ tests }, { status: 201 });
  } catch {
    return Response.json({ error: "The tests couldn't be written just now. Try again in a moment." }, { status: 502 });
  }
}
