// Email: password resets, and alerts when a customer needs a person. Sent through the mail server in SMTP_URL (any
// provider the business already has); without one, nothing is sent and callers say so instead.

import nodemailer, { type Transporter } from "nodemailer";
import { setting } from "./settings";

let cached: { url: string; transport: Transporter } | undefined;

function transport(): Transporter | undefined {
  const url = setting("SMTP_URL");
  if (!url) return undefined;
  if (cached?.url !== url) cached = { url, transport: nodemailer.createTransport(url) };
  return cached.transport;
}

/** Whether this server can send email. */
export const canSendMail = () => Boolean(setting("SMTP_URL"));

/** Who emails come from: MAIL_FROM, or the mail server's user. */
function sender(): string {
  const from = setting("MAIL_FROM");
  if (from) return from;
  const user = decodeURIComponent(new URL(setting("SMTP_URL")!.replace(/^smtps?:/, "http:")).username);
  return user.includes("@") ? `Keel <${user}>` : "Keel <no-reply@localhost>";
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A short email: a few paragraphs and, when given, one button. Returns false when there's no mail server or it failed. */
export async function sendMail(input: { to: string | string[]; subject: string; paragraphs: string[]; button?: { label: string; url: string } }): Promise<boolean> {
  const t = transport();
  const to = [input.to].flat().filter(Boolean);
  if (!t || !to.length) return false;
  const text = [...input.paragraphs, ...(input.button ? [`${input.button.label}: ${input.button.url}`] : [])].join("\n\n");
  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#15171c;max-width:520px">`,
    ...input.paragraphs.map((p) => `<p style="margin:0 0 14px">${escape(p).replace(/\n/g, "<br>")}</p>`),
    input.button
      ? `<p style="margin:20px 0"><a href="${escape(input.button.url)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">${escape(input.button.label)}</a></p>`
      : "",
    `</div>`,
  ].join("");
  try {
    await t.sendMail({ from: sender(), to, subject: input.subject, text, html });
    return true;
  } catch (error) {
    console.error(`Keel couldn't send an email (${input.subject}): ${(error as Error).message}`);
    return false;
  }
}
