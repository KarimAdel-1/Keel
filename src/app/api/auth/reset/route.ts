import { z } from "zod";
import { AccountError, finishPasswordReset, startSession } from "@/platform/accounts";
import { setSession } from "@/platform/session";

const Body = z.object({ token: z.string().max(200), password: z.string().max(200) });

/** Sets the new password from a reset link, signs out everywhere else, and signs in here. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please choose a new password." }, { status: 400 });
  try {
    const user = await finishPasswordReset(parsed.data.token, parsed.data.password);
    const session = await startSession(user.id);
    await setSession(session.token, session.expiresAt);
    return Response.json({ ok: true });
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;
    return Response.json({ error: error.message }, { status: 400 });
  }
}
