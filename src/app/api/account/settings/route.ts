import { z } from "zod";
import { setUserSettings, userSettings } from "@/platform/accounts";
import { apiUser } from "@/platform/session";

export async function GET() {
  const who = await apiUser();
  if (who instanceof Response) return who;
  return Response.json({ settings: await userSettings(who.user.id) });
}

/** The signed-in person's own settings: whether they get an email when a customer needs a person. */
export async function PATCH(request: Request) {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const parsed = z.object({ emailAlerts: z.boolean().optional() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "That setting isn't valid." }, { status: 400 });
  return Response.json({ settings: await setUserSettings(who.user.id, parsed.data) });
}
