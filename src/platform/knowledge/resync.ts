// Reading websites again: on demand ("Read again"), or on a schedule for agents set to resync daily or weekly, so the
// agent keeps up with the business's site. Only changed pages are trained again (the text's hash decides).

import { system } from "@/lib/db";
import { withTenant } from "@/lib/tenant";
import { json } from "@/lib/rows";
import { getAgent, listSources, updateAgent } from "../store";
import { startSiteRead } from "./jobs";

const PERIOD_MS = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const;
/** How often the schedule looks for agents that are due. */
const CHECK_EVERY_MS = 15 * 60_000;

/** The websites an agent has read: each site's start page. */
export async function agentSites(agentId: string): Promise<string[]> {
  const agent = await getAgent(agentId);
  const origins = new Set<string>();
  for (const s of await listSources(agentId)) if (s.kind === "website" && s.url) origins.add(new URL(s.url).origin + "/");
  if (agent?.config.profile.website) origins.add(new URL(agent.config.profile.website).origin + "/");
  return [...origins];
}

/** Reads all of an agent's websites again now. Returns how many sites. */
export async function resyncAgent(agentId: string): Promise<number> {
  const sites = await agentSites(agentId);
  for (const site of sites) await startSiteRead(agentId, site);
  const agent = await getAgent(agentId);
  if (agent) await updateAgent(agentId, { config: { resync: { ...agent.config.resync, lastAt: new Date().toISOString() } } });
  return sites.length;
}

/** Agents whose scheduled resync is due, across every business, with the business each belongs to. */
export async function dueForResync(at = Date.now()): Promise<{ id: string; workspaceId: string }[]> {
  const rows = await system().prepare("SELECT id, workspace_id, config FROM agents").all<{ id: string; workspace_id: string; config: string }>();
  return rows
    .filter((r) => {
      const resync = json<{ resync?: { every?: "off" | "daily" | "weekly"; lastAt?: string } }>(r.config, {}).resync;
      if (!resync?.every || resync.every === "off") return false;
      return !resync.lastAt || at - new Date(resync.lastAt).getTime() >= PERIOD_MS[resync.every];
    })
    .map((r) => ({ id: r.id, workspaceId: r.workspace_id }));
}

export function startResyncTimer(): void {
  const state = globalThis as unknown as { __keelResync?: NodeJS.Timeout };
  if (state.__keelResync) return;
  state.__keelResync = setInterval(() => {
    void (async () => {
      for (const due of await dueForResync()) await withTenant(due.workspaceId, () => resyncAgent(due.id));
    })().catch(() => {
      // A failed check waits for the next one.
    });
  }, CHECK_EVERY_MS);
  state.__keelResync.unref?.();
}
