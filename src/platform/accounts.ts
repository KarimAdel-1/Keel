// Accounts, workspaces and sign-in. Passwords are hashed with scrypt (built into Node), each with its own salt; a
// session is a random token whose hash is stored, so the database alone can't be used to sign in. Signing up
// creates the person's first workspace, with them as its owner. Accounts, sessions, workspaces and memberships aren't
// any one business's data, so they're read before a business is chosen (src/lib/db.ts).

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db, transaction } from "@/lib/db";

export type Role = "owner" | "admin" | "member";

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  role: Role;
}

const SESSION_DAYS = 30;
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export class AccountError extends Error {}

/** What someone trying to sign up on a private server (KEEL_PRIVATE) is told. */
export const PRIVATE_SIGNUP = "This is a private server: its accounts are made by whoever runs it.";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const normalEmail = (email: string) => email.trim().toLowerCase();

/** A new account, checked, with no workspace yet (signUp gives it one; an invitation joins it to another). */
export async function createUser(input: { email: string; name: string; password: string }): Promise<User> {
  const email = normalEmail(input.email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AccountError("That doesn't look like an email address.");
  if (input.password.length < 8) throw new AccountError("Use at least 8 characters for your password.");
  const name = input.name.trim() || email.split("@")[0];
  if (await db().prepare("SELECT 1 FROM users WHERE email = ?").get(email)) throw new AccountError("There's already an account with this email. Sign in instead.");
  const user: User = { id: newId("usr"), email, name };
  await db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, email, name, hashPassword(input.password), now());
  return user;
}

export function signUp(input: { email: string; name: string; password: string }): Promise<{ user: User; workspace: Workspace }> {
  return transaction(async (d) => {
    const user = await createUser(input);
    const workspace: Workspace = { id: newId("wsp"), name: `${user.name}'s workspace`, role: "owner" };
    const at = now();
    await d.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(workspace.id, workspace.name, at);
    await d.prepare("INSERT INTO members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(workspace.id, user.id, at);
    return { user, workspace };
  });
}

/** The user, if the email and password match. The same message either way, so an email's existence isn't revealed. */
export async function signIn(email: string, password: string): Promise<User> {
  const row = await db().prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get<{ id: string; email: string; name: string; password_hash: string }>(normalEmail(email));
  if (!row || !checkPassword(password, row.password_hash)) throw new AccountError("That email and password don't match.");
  return { id: row.id, email: row.email, name: row.name };
}

/** A new session for the user: the token goes in their cookie, only its hash is stored. */
export async function startSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const at = new Date();
  const expiresAt = new Date(at.getTime() + SESSION_DAYS * 86_400_000).toISOString();
  await db().prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), userId, at.toISOString(), expiresAt);
  return { token, expiresAt };
}

export async function sessionUser(token: string | undefined): Promise<User | undefined> {
  if (!token) return undefined;
  const row = await db()
    .prepare("SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?")
    .get<{ id: string; email: string; name: string; expires_at: string }>(tokenHash(token));
  if (!row || row.expires_at < now()) return undefined;
  return { id: row.id, email: row.email, name: row.name };
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await db().prepare("DELETE FROM sessions WHERE id = ?").run(tokenHash(token));
}

export async function workspacesOf(userId: string): Promise<Workspace[]> {
  return (await db()
    .prepare("SELECT w.id, w.name, m.role FROM members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? ORDER BY w.created_at")
    .all<{ id: string; name: string; role: Role }>(userId)).map((w) => ({ ...w }));
}

export async function renameWorkspace(workspaceId: string, name: string): Promise<void> {
  await db().prepare("UPDATE workspaces SET name = ? WHERE id = ?").run(name.slice(0, 80), workspaceId);
}

/** The people in a workspace, for the team pages (who has a ticket, who wrote a note). */
export async function membersOf(workspaceId: string): Promise<(User & { role: Role; joinedAt: string })[]> {
  return (await db()
    .prepare("SELECT u.id, u.email, u.name, m.role, m.created_at FROM members m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.created_at")
    .all<{ id: string; email: string; name: string; role: Role; created_at: string }>(workspaceId)).map((m) => ({ id: m.id, email: m.email, name: m.name, role: m.role, joinedAt: m.created_at }));
}

/** The user's role in a workspace, or undefined when they aren't a member. */
export async function roleIn(userId: string, workspaceId: string): Promise<Role | undefined> {
  return (await db().prepare("SELECT role FROM members WHERE user_id = ? AND workspace_id = ?").get<{ role?: Role }>(userId, workspaceId))?.role;
}

export interface UserSettings {
  /** An email when a customer needs a person (on unless turned off). */
  emailAlerts?: boolean;
}

export async function userSettings(userId: string): Promise<UserSettings> {
  const row = await db().prepare("SELECT settings FROM users WHERE id = ?").get<{ settings: string }>(userId);
  try {
    return row ? (JSON.parse(row.settings) as UserSettings) : {};
  } catch {
    return {};
  }
}

export async function setUserSettings(userId: string, change: UserSettings): Promise<UserSettings> {
  const next = { ...(await userSettings(userId)), ...change };
  await db().prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(next), userId);
  return next;
}

const RESET_MINUTES = 60;

/**
 * A link to choose a new password: the token goes in the email, only its hash is stored, and it works once, for an
 * hour. Undefined when there's no account for the email (the caller answers the same either way).
 */
export async function startPasswordReset(email: string): Promise<{ token: string; email: string; name: string } | undefined> {
  const user = await db().prepare("SELECT id, email, name FROM users WHERE email = ?").get<{ id: string; email: string; name: string }>(normalEmail(email));
  if (!user) return undefined;
  const token = randomBytes(32).toString("base64url");
  const at = new Date();
  await db().prepare("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(tokenHash(token), user.id, at.toISOString(), new Date(at.getTime() + RESET_MINUTES * 60_000).toISOString());
  return { token, email: user.email, name: user.name };
}

/** Sets the new password from a reset link and signs the person out everywhere else. Throws when the link can't be used. */
export async function finishPasswordReset(token: string, password: string): Promise<User> {
  if (password.length < 8) throw new AccountError("Use at least 8 characters for your password.");
  return transaction(async (d) => {
    const reset = await d.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get<{ user_id: string }>(tokenHash(token), now());
    if (!reset) throw new AccountError("This link has been used or has expired. Ask for a new one.");
    await d.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(now(), tokenHash(token));
    await d.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), reset.user_id);
    await d.prepare("DELETE FROM sessions WHERE user_id = ?").run(reset.user_id);
    return (await d.prepare("SELECT id, email, name FROM users WHERE id = ?").get<User>(reset.user_id))!;
  });
}
