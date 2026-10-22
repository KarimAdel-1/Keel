import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AuthForm } from "@/components/AuthForm";
import { setting } from "@/lib/settings";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  // Read on each visit: whether this server is private is its own setting, not the build's. A private server's
  // accounts are made for people (the judges), so every "Try for free" on the site leads to signing in.
  await connection();
  if (setting("KEEL_PRIVATE")) redirect("/login");
  return <AuthForm mode="signup" />;
}
