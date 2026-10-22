import { z } from "zod";
import { garakInstalled } from "@/lib/garak";
import { listScans, startScan } from "@/platform/security";
import { apiAgent } from "@/platform/session";

/** The agent's security scans, and whether NVIDIA garak is installed. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/security">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({
    scans: await listScans(access.agent.id),
    installed: garakInstalled(),
  });
}

/** Starts a security scan with NVIDIA garak, in the background. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/security">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  if (!garakInstalled()) return Response.json({ error: "NVIDIA garak isn't installed on this server (uv tool install garak), or set GARAK_BIN." }, { status: 503 });
  const parsed = z.object({ depth: z.enum(["quick", "thorough"]).default("quick") }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Choose quick or thorough." }, { status: 400 });
  const started = await startScan(access.agent.id, parsed.data.depth, access.user.id);
  if ("error" in started) return Response.json(started, { status: 409 });
  return Response.json({ scan: started }, { status: 202 });
}
