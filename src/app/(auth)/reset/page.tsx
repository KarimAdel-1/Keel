import type { Metadata } from "next";
import Link from "next/link";
import { PasswordReset } from "@/components/PasswordReset";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const token = (await searchParams).token;
  if (typeof token !== "string" || !token) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16 text-center text-sm text-muted">
        <p>
          This link is incomplete. <Link href="/forgot" className="link">Ask for a new one</Link>.
        </p>
      </div>
    );
  }
  return <PasswordReset mode="reset" token={token} canEmail />;
}
