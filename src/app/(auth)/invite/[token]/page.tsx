import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Wordmark } from "@/components/Wordmark";
import { JoinWorkspace } from "@/components/workspace/JoinWorkspace";
import { inviteFor } from "@/platform/invites";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Join a workspace" };

/** An invitation link: join with your account, or create one to join. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = (await inviteFor(token));
  const user = await currentUser();
  if (!invite) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <Wordmark />
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">This invitation can&apos;t be used</h1>
          <p className="mt-2 text-sm text-muted">It has been used, withdrawn or has expired. Ask the person who invited you for a new link.</p>
          <Link href="/" className="btn btn-secondary mt-6">
            Go to Keel
          </Link>
        </div>
      </div>
    );
  }
  if (!user) return <AuthForm mode="signup" invite={{ token, workspaceName: invite.workspaceName }} />;
  return <JoinWorkspace token={token} workspaceName={invite.workspaceName} role={invite.role} email={user.email} />;
}
