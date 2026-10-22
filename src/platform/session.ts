// Who is signed in, from the session cookie, for pages and API routes. Once access is checked, the business it's for is
// set for the rest of the request (src/lib/tenant.ts): the database then shows only that business's data.

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Agent } from "@/core/agents";
import { system } from "@/lib/db";
import { setting } from "@/lib/settings";
import { enterTenant } from "@/lib/tenant";
import { roleIn, sessionUser, workspacesOf, type User, type Workspace } from "./accounts";
import { getTicket, type Ticket } from "./helpdesk";
import { agentWorkspace, getAgent } from "./store";

export const SESSION_COOKIE = "keel_session";
/** Which of their workspaces a person is working in, when they belong to more than one. */
export const WORKSPACE_COOKIE = "keel_workspace";

/** The user's current workspace: the one they last chose, else their first. */
async function currentWorkspace(userId: string): Promise<Workspace | undefined> {
  const all = await workspacesOf(userId);
  const chosen = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return all.find((w) => w.id === chosen) ?? all[0];
}

export async function chooseWorkspace(workspaceId: string): Promise<void> {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function currentUser(): Promise<User | undefined> {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Which signed-in browser this is, for what's kept per person rather than per account (the Copilot conversation):
 * several people can share one account (a team, the hackathon's judges). Empty with no session.
 */
export async function browserThread(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? createHash("sha256").update(`thread:${token}`).digest("hex").slice(0, 24) : "";
}

/** For pages: the signed-in user and their workspace, or a redirect to sign in. */
export async function requireUser(): Promise<{ user: User; workspace: Workspace }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const workspace = await currentWorkspace(user.id);
  if (!workspace) redirect("/login");
  await enterTenant(workspace.id);
  return { user, workspace };
}

/** For API routes: the signed-in user and their workspace, or a 401 answer to return. */
export async function apiUser(): Promise<{ user: User; workspace: Workspace } | Response> {
  const user = await currentUser();
  const workspace = user ? await currentWorkspace(user.id) : undefined;
  if (!user || !workspace) return Response.json({ error: "Please sign in again." }, { status: 401 });
  await enterTenant(workspace.id);
  return { user, workspace };
}

/** The agent, if the user belongs to its workspace: that workspace is then the business for the rest of the request. */
async function agentFor(userId: string, agentId: string): Promise<Agent | undefined> {
  const workspaceId = await agentWorkspace(agentId);
  if (!workspaceId || !(await roleIn(userId, workspaceId))) return undefined;
  await enterTenant(workspaceId);
  return getAgent(agentId);
}

/**
 * For pages: an agent in one of the signed-in user's workspaces, with that workspace, or "not found" (an agent
 * elsewhere isn't revealed).
 */
export async function requireAgent(agentId: string): Promise<{ user: User; workspace: Workspace; agent: Agent }> {
  const { user } = await requireUser();
  const agent = await agentFor(user.id, agentId);
  const workspace = agent && (await workspacesOf(user.id)).find((w) => w.id === agent.workspaceId);
  if (!agent || !workspace) notFound();
  return { user, workspace, agent };
}

/**
 * The agent a visitor's chat is for, with no one signed in: its business is set for the rest of the request, from the
 * agent itself, so only that business's data is reachable.
 */
export async function visitorAgent(agentId: string, viewer: () => Promise<User | undefined> = currentUser): Promise<Agent | undefined> {
  const workspaceId = await agentWorkspace(agentId);
  if (!workspaceId) return undefined;
  await enterTenant(workspaceId);
  // A private server's agents answer only people signed in to their own workspace (KEEL_PRIVATE).
  if (setting("KEEL_PRIVATE")) {
    const user = await viewer();
    if (!user || !(await roleIn(user.id, workspaceId))) return undefined;
  }
  return getAgent(agentId);
}

/** For API routes: an agent in the signed-in user's workspace, or the answer to return. */
export async function apiAgent(agentId: string): Promise<{ user: User; agent: Agent } | Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const agent = await agentFor(user.id, agentId);
  if (!agent) return Response.json({ error: "That agent doesn't exist." }, { status: 404 });
  return { user, agent };
}

/** For API routes: a ticket of one of the signed-in user's agents, or the answer to return. */
export async function apiTicket(ticketId: string): Promise<{ who: { user: User; workspace: Workspace }; ticket: Ticket } | Response> {
  const who = await apiUser();
  if (who instanceof Response) return who;
  const ticketWorkspace = (await system().prepare("SELECT workspace_id FROM tickets WHERE id = ?").get<{ workspace_id: string }>(ticketId))?.workspace_id;
  const ticket = ticketWorkspace === who.workspace.id ? await getTicket(ticketId) : undefined;
  if (!ticket) return Response.json({ error: "That ticket doesn't exist." }, { status: 404 });
  return { who, ticket };
}

export async function setSession(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}
