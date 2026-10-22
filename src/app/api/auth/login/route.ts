import { z } from "zod";
import { AccountError, signIn, startSession } from "@/platform/accounts";
import { setSession } from "@/platform/session";

const Body = z.object({ email: z.string().max(200), password: z.string().max(200) });

// Failed sign-ins per email, per quarter hour: slows down password guessing.
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
const LIMIT = 8;

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please fill in your email and password." }, { status: 400 });
  const key = parsed.data.email.trim().toLowerCase();
  const recent = (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (recent.length >= LIMIT) return Response.json({ error: "Too many tries. Please wait 15 minutes and try again." }, { status: 429 });
  try {
    const user = (await signIn(parsed.data.email, parsed.data.password));
    failures.delete(key);
    const session = (await startSession(user.id));
    await setSession(session.token, session.expiresAt);
    return Response.json({ ok: true });
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;
    failures.set(key, [...recent, Date.now()]);
    return Response.json({ error: error.message }, { status: 401 });
  }
}
