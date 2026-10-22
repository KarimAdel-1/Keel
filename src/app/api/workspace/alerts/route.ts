import { ticketsForAlerts } from "@/platform/alerts";
import { apiUser } from "@/platform/session";

/** What customers did since `since` that needs the team: polled by the dashboard for its sound and notifications. */
export async function GET(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const since = new URL(request.url).searchParams.get("since") ?? new Date().toISOString();
  return Response.json({ alerts: await ticketsForAlerts(who.workspace.id, since.slice(0, 40)) });
}
