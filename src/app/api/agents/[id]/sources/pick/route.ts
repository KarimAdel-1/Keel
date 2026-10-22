import { z } from "zod";
import { learnChosenPages } from "@/platform/knowledge/jobs";
import { apiAgent } from "@/platform/session";

const Body = z.object({ readId: z.string().max(40), urls: z.array(z.string().max(2000)).max(500) });

/** Learns the website pages the builder kept from the ones Keel found. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/sources/pick">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose the pages to learn." }, { status: 400 });
  const learned = await learnChosenPages(access.agent.id, parsed.data.readId, parsed.data.urls);
  if (learned === undefined) return Response.json({ error: "Those pages aren't waiting any more. Find them again." }, { status: 404 });
  return Response.json({ learned });
}
