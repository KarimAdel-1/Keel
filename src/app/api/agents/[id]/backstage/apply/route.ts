import { z } from "zod";
import { applyProposal } from "@/platform/backstage";
import { apiAgent } from "@/platform/session";
import { saveVersion } from "@/platform/versions";

/** Applies a change the Copilot proposed, once the builder approves it. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/backstage/apply">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = z.object({ messageId: z.number().int(), index: z.number().int().min(0).max(5) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That suggestion no longer exists." }, { status: 400 });
  const result = (await applyProposal(access.agent, parsed.data.messageId, parsed.data.index));
  if (result.ok) await saveVersion(access.agent.id, { label: "Applied a Copilot suggestion", origin: "backstage", authorId: access.user.id });
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
