import { apiAgent } from "@/platform/session";
import { restoreVersion } from "@/platform/versions";

/** Puts the agent back as it was in this version (what it is now is kept as a version first). */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/versions/[versionId]">) {
  const { id, versionId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const result = (await restoreVersion(access.agent.id, versionId, access.user.id));
  if (!result.ok) return Response.json({ error: "That version doesn't exist." }, { status: 404 });
  return Response.json(result);
}
