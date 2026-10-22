import { z } from "zod";
import { AccountError, PRIVATE_SIGNUP, signUp, startSession, workspacesOf } from "@/platform/accounts";
import { signUpWithInvite } from "@/platform/invites";
import { chooseWorkspace, setSession } from "@/platform/session";
import { setting } from "@/lib/settings";

const Body = z.object({ email: z.string().max(200), name: z.string().max(100).default(""), password: z.string().max(200), invite: z.string().max(200).optional() });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please fill in your email and a password." }, { status: 400 });
  // A private server's accounts are made by whoever runs it (npm run create-account), never here.
  if (setting("KEEL_PRIVATE")) return Response.json({ error: PRIVATE_SIGNUP }, { status: 403 });
  // With an invitation, the new account joins that workspace (even where open sign-ups are off).
  if (!parsed.data.invite && !setting("KEEL_SIGNUPS")) return Response.json({ error: "New accounts are by invitation on this server." }, { status: 403 });
  try {
    const { invite, ...input } = parsed.data;
    const user = invite ? (await signUpWithInvite(input, invite)).user : (await signUp(input)).user;
    const session = (await startSession(user.id));
    await setSession(session.token, session.expiresAt);
    if (invite) await chooseWorkspace((await workspacesOf(user.id))[0].id);
    return Response.json({ ok: true, invited: Boolean(invite) });
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
