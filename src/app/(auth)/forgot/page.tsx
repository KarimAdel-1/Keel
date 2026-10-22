import type { Metadata } from "next";
import { PasswordReset } from "@/components/PasswordReset";
import { canSendMail } from "@/lib/mail";

export const metadata: Metadata = { title: "Forgot your password?" };

export default function ForgotPage() {
  return <PasswordReset mode="request" canEmail={canSendMail()} />;
}
