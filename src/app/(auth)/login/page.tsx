import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";
import { setting } from "@/lib/settings";
import { PRIVATE_SIGNUP } from "@/platform/accounts";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  // Only a path on this site: never somewhere else.
  const safe = typeof next === "string" && /^\/(?!\/)/.test(next) ? next : undefined;
  return <AuthForm mode="login" {...(safe ? { next: safe } : {})} {...(setting("KEEL_PRIVATE") ? { closed: PRIVATE_SIGNUP } : {})} />;
}
