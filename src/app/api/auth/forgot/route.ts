import { z } from "zod";
import { sendMail } from "@/lib/mail";
import { publicUrl } from "@/lib/public-url";
import { startPasswordReset } from "@/platform/accounts";

const Body = z.object({ email: z.string().max(200) });

// Reset emails per address, per hour: a form anyone can use mustn't flood someone's inbox.
const sent = new Map<string, number[]>();
const WINDOW = 60 * 60_000;
const LIMIT = 3;

/** Emails a link to choose a new password. The answer is the same whether or not the email has an account. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Please fill in your email." }, { status: 400 });
  const key = parsed.data.email.trim().toLowerCase();
  const recent = (sent.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (recent.length >= LIMIT) return Response.json({ ok: true });
  sent.set(key, [...recent, Date.now()]);
  const reset = await startPasswordReset(parsed.data.email);
  if (reset) {
    await sendMail({
      to: reset.email,
      subject: "Choose a new password for Keel",
      paragraphs: [`Hi ${reset.name},`, "Someone (hopefully you) asked to reset the password for your Keel account. The link works once, for an hour.", "If it wasn't you, ignore this email: your password stays as it is."],
      button: { label: "Choose a new password", url: `${await publicUrl()}/reset?token=${encodeURIComponent(reset.token)}` },
    });
  }
  return Response.json({ ok: true });
}
