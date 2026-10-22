import { getScan, stopScan } from "@/platform/security";
import { apiAgent } from "@/platform/session";

async function find(params: RouteContext<"/api/agents/[id]/security/[scanId]">["params"]) {
  const { id, scanId } = await params;
  const access = await apiAgent(id);
  if (access instanceof Response) return access;
  const scan = (await getScan(scanId));
  if (!scan || scan.agentId !== access.agent.id) return Response.json({ error: "That scan doesn't exist." }, { status: 404 });
  return scan;
}

export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/security/[scanId]">) {
  const scan = await find(params);
  return scan instanceof Response ? scan : Response.json({ scan });
}

/** Stops a running scan. */
export async function POST(_request: Request, { params }: RouteContext<"/api/agents/[id]/security/[scanId]">) {
  const scan = await find(params);
  if (scan instanceof Response) return scan;
  await stopScan(scan.id);
  return Response.json({ scan: await getScan(scan.id) });
}
