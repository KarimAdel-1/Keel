import { apiAgent } from "@/platform/session";
import { listVersions } from "@/platform/versions";

/** The agent's saved versions, newest first (without their full settings). */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/versions">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ versions: (await listVersions(access.agent.id)).map((v) => ({ id: v.id, label: v.label, origin: v.origin, authorId: v.authorId, createdAt: v.createdAt })) });
}
