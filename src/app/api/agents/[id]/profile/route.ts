import { draftProfile } from "@/platform/knowledge/profile";
import { apiAgent } from "@/platform/session";

/** A first draft of the business's profile and its agent, from what the agent knows. Nothing is saved. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/profile">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const { agent } = access;
  try {
    const name = agent.config.brand.siteName ?? (agent.config.profile.website ? undefined : agent.name);
    const { draft } = await draftProfile(agent.id, { name, website: agent.config.profile.website });
    return Response.json({ draft });
  } catch {
    return Response.json({ error: "Keel couldn't write a draft just now. You can fill it in yourself, or try again in a moment." }, { status: 502 });
  }
}
