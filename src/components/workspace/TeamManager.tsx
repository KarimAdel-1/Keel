"use client";

import { Link2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Invite } from "@/platform/invites";
import { CopyCode } from "../channel/CopyCode";
import { Notice, Pill, timeAgo } from "../ui";

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** The people in a workspace and the open invitations; owners and admins invite by link and can remove people. */
export function TeamManager({
  members,
  invites: initialInvites,
  me,
  canManage,
  limit,
}: {
  members: { id: string; name: string; email: string; role: string }[];
  invites: Invite[];
  me: string;
  canManage: boolean;
  limit: number;
}) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setError(null);
    const res = await fetch("/api/workspace/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    const body = (await res.json().catch(() => ({}))) as { invite?: Invite; link?: string; error?: string };
    if (!res.ok || !body.invite || !body.link) return setError(body.error ?? "The invitation couldn't be made.");
    setInvites((all) => [body.invite!, ...all]);
    setLink(body.link);
  }

  async function revoke(id: string) {
    setInvites((all) => all.filter((i) => i.id !== id));
    await fetch(`/api/workspace/invites/${id}`, { method: "DELETE" });
  }

  async function remove(id: string) {
    const res = await fetch(`/api/workspace/members/${id}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "They couldn't be removed.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-xl border border-line">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold">{m.name.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {m.name} {m.id === me && <span className="font-normal text-muted">(you)</span>}
              </span>
              <span className="block truncate text-xs text-muted">{m.email}</span>
            </span>
            <Pill>{ROLE[m.role] ?? m.role}</Pill>
            {canManage && m.role !== "owner" && m.id !== me && (
              <button type="button" onClick={() => void remove(m.id)} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-bad" title={`Remove ${m.name}`}>
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm font-semibold">Invite someone</p>
          <p className="text-xs text-muted">
            Make a link and send it to them however you like. It works once, for 7 days. {members.length} of {limit} people on this plan.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} className="field w-auto">
              <option value="member">As a member</option>
              <option value="admin">As an admin (can invite and remove people)</option>
            </select>
            <button type="button" onClick={() => void invite()} disabled={members.length + invites.length >= limit} className="btn btn-primary">
              <Link2 className="size-4" /> Make an invitation link
            </button>
          </div>
          {link && (
            <div className="space-y-1">
              <CopyCode code={link} label="Copy link" />
              <p className="text-xs text-muted">Copy it now: for safety it isn&apos;t shown again.</p>
            </div>
          )}
          {error && <Notice>{error}</Notice>}
          {invites.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1">
                    Invitation as {ROLE[i.role].toLowerCase()} <span className="text-xs text-muted">· made {timeAgo(i.createdAt)}, expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </span>
                  <button type="button" onClick={() => void revoke(i.id)} className="btn btn-ghost px-2 py-1 text-xs">
                    Withdraw
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">Ask the owner or an admin to invite people.</p>
      )}
    </div>
  );
}
