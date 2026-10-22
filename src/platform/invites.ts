// Inviting people to a workspace, by link (Keel sends no email). An owner or admin makes an invite with a role; its
// link works once, for 7 days, and can be withdrawn. Only the token's hash is stored, so the database alone can't be
// used to join. Someone without an account signs up through the link and joins this workspace instead of getting
// one of their own; someone with an account joins with one click.

import { createHash, randomBytes } from "node:crypto";
import { LIMITS } from "@/core/limits";
import { db, system, transaction } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { newId, now } from "@/lib/rows";
import { AccountError, createUser, membersOf, type Role, type User } from "./accounts";

const DAYS = 7;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export interface Invite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: Exclude<Role, "owner">;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

type Row = { id: string; workspace_id: string; workspace_name: string; role: Invite["role"]; created_at: string; expires_at: string; used_at: string | null };

const toInvite = (r: Row): Invite => ({ id: r.id, workspaceId: r.workspace_id, workspaceName: r.workspace_name, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at, ...(r.used_at ? { usedAt: r.used_at } : {}) });
const SELECT = "SELECT i.*, w.name AS workspace_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id";

/** Makes an invite. The returned token (in the link) is the only time it can be seen. */
export async function createInvite(workspaceId: string, role: Invite["role"], createdBy: string): Promise<{ token: string; invite: Invite }> {
  const token = randomBytes(24).toString("base64url");
  const id = newId("inv");
  const at = new Date();
  await db()
    .prepare("INSERT INTO invites (id, token_hash, workspace_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, hash(token), workspaceId, role, createdBy, at.toISOString(), new Date(at.getTime() + DAYS * 86_400_000).toISOString());
  return { token, invite: toInvite((await db().prepare(`${SELECT} WHERE i.id = ?`).get<Row>(id))!) };
}

/** Invites not used yet and not expired. */
export async function pendingInvites(workspaceId: string): Promise<Invite[]> {
  return (await db().prepare(`${SELECT} WHERE i.workspace_id = ? AND i.used_at IS NULL AND i.expires_at > ? ORDER BY i.created_at DESC`).all<Row>(workspaceId, now())).map(toInvite);
}

export async function revokeInvite(workspaceId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM invites WHERE id = ? AND workspace_id = ? AND used_at IS NULL").run(id, workspaceId);
}

/**
 * The invite a link's token opens, while it's usable. Found by its token before the person is in that business, so
 * it's looked up across businesses; only a token's hash matches.
 */
export async function inviteFor(token: string): Promise<Invite | undefined> {
  const row = await system().prepare(`${SELECT} WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`).get<Row>(hash(token), now());
  return row ? toInvite(row) : undefined;
}

/** Adds the user to the invite's workspace and uses the invite up. Throws when it can't. */
export async function acceptInvite(token: string, userId: string): Promise<Invite> {
  const invite = await inviteFor(token);
  if (!invite) throw new AccountError("This invitation has been used, withdrawn or has expired. Ask for a new one.");
  const members = await membersOf(invite.workspaceId);
  if (!members.some((m) => m.id === userId)) {
    if (members.length >= LIMITS.members) throw new AccountError(`${invite.workspaceName} already has ${LIMITS.members} people, the most a workspace can have.`);
  }
  // The token opened this business: using the invite up is its data.
  await withTenant(invite.workspaceId, () =>
    transaction(async (d) => {
      await d.prepare("INSERT INTO members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(invite.workspaceId, userId, invite.role, now());
      await d.prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?").run(now(), userId, invite.id);
    }),
  );
  return invite;
}

/** Takes someone out of a workspace. The owner can't be removed. */
export async function removeMember(workspaceId: string, userId: string): Promise<boolean> {
  return (await db().prepare("DELETE FROM members WHERE workspace_id = ? AND user_id = ? AND role != 'owner'").run(workspaceId, userId)).changes > 0;
}

/** A new account made through an invitation: it joins the invited workspace instead of getting its own. */
export async function signUpWithInvite(input: { email: string; name: string; password: string }, token: string): Promise<{ user: User; invite: Invite }> {
  if (!(await inviteFor(token))) throw new AccountError("This invitation has been used, withdrawn or has expired. Ask for a new one.");
  return transaction(async () => {
    const user = await createUser(input);
    return { user, invite: await acceptInvite(token, user.id) };
  });
}
