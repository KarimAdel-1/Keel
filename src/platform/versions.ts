// Versions of an agent: what it was (its settings, actions and procedures) after each change, so any change can be
// undone. A version is saved after a builder saves a change, after an improvement or a Backstage suggestion is
// applied, and before a restore; the same state twice in a row is kept once. Restoring a version puts the settings,
// actions and procedures back exactly, and removes the Q&As improvements added since.

import { createHash } from "node:crypto";
import type { Action } from "@/core/actions";
import { qaText } from "@/core/agents";
import type { AgentSnapshot } from "@/core/patches";
import { db, transaction } from "@/lib/db";
import { json, newId, now } from "@/lib/rows";
import { openSecret, sealSecret } from "@/lib/secrets";
import { deleteAction, listActions, restoreAction } from "./actions";
import { deleteProcedure, listProcedures, restoreProcedure } from "./procedures";
import { queueTraining } from "./knowledge/jobs";
import { forgetLesson, rememberDecision } from "./memory";
import { addSource, deleteSource, getAgent, getSource, updateAgent } from "./store";

export type VersionOrigin = "change" | "improvement" | "backstage" | "restore" | "created";

export interface AgentVersion {
  id: string;
  agentId: string;
  label: string;
  origin: VersionOrigin;
  snapshot: AgentSnapshot;
  /** For an improvement: the Q&A sources it added, removed again when an earlier version is restored. */
  addedSourceIds: string[];
  /** Their text, so restoring this version (or a later one) can put them back. */
  addedQas: { sourceId: string; question: string; answer: string }[];
  /** For an improvement: the session and the fixes it applied, so undoing them is remembered (memory.ts). */
  improvement?: { id: string; fixes: { fix: string; hypothesis: string; tests: string[] }[] };
  authorId?: string;
  createdAt: string;
}

type Row = { id: string; agent_id: string; label: string; origin: VersionOrigin; snapshot: string; fingerprint: string; meta: string; author_id: string | null; created_at: string };

/** What a version keeps of an agent's settings: everything except bookkeeping (setup progress, last re-read). */
const keptConfig = (config: AgentSnapshot["config"]) => {
  const kept: Partial<AgentSnapshot["config"]> = { ...config, resync: { every: config.resync.every } };
  delete kept.setupSkipped;
  return kept as Omit<AgentSnapshot["config"], "setupSkipped">;
};

const headerPlace = (agentId: string) => `${agentId}/version.headers`;

/** Action header values (API keys) are sealed inside stored versions too. */
function sealActions(agentId: string, actions: Action[], open: boolean): Action[] {
  return actions.map((a) => {
    const c = a.config as { headers?: { name: string; value: string }[] };
    if (!Array.isArray(c.headers)) return a;
    const headers = c.headers.map((h) => {
      try {
        return { name: h.name, value: open ? openSecret(h.value, headerPlace(agentId)) : sealSecret(h.value, headerPlace(agentId)) };
      } catch {
        return { name: h.name, value: "" };
      }
    });
    return { ...a, config: { ...a.config, headers } } as Action;
  });
}

/** The agent as it is now. */
export async function snapshotOf(agentId: string): Promise<AgentSnapshot | undefined> {
  const agent = await getAgent(agentId);
  if (!agent) return undefined;
  return { name: agent.name, config: agent.config, actions: await listActions(agentId), procedures: await listProcedures(agentId) };
}

/** A fingerprint of what a version would hold, ignoring times and sealed-value randomness. */
function fingerprintOf(snapshot: AgentSnapshot): string {
  const stable = {
    name: snapshot.name,
    config: keptConfig(snapshot.config),
    actions: snapshot.actions.map((a) => ({ ...a, createdAt: "", updatedAt: "" })),
    procedures: snapshot.procedures.map((p) => ({ ...p, createdAt: "", updatedAt: "" })),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/**
 * What the agent answers with right now (its settings, actions, procedures and knowledge), as a fingerprint: two
 * moments with the same fingerprint answer alike, so results from one hold for the other.
 */
export async function agentFingerprint(agentId: string): Promise<string | undefined> {
  const snapshot = await snapshotOf(agentId);
  if (!snapshot) return undefined;
  const knowledge = await db().prepare("SELECT id, content_hash, status FROM sources WHERE agent_id = ? ORDER BY id").all(agentId);
  return createHash("sha256").update(fingerprintOf(snapshot)).update(JSON.stringify(knowledge)).digest("hex").slice(0, 32);
}

const toVersion = (r: Row): AgentVersion => {
  const stored = json<AgentSnapshot>(r.snapshot, { name: "", config: {} as AgentSnapshot["config"], actions: [], procedures: [] });
  return {
    id: r.id,
    agentId: r.agent_id,
    label: r.label,
    origin: r.origin,
    snapshot: { ...stored, actions: sealActions(r.agent_id, stored.actions, true) },
    addedSourceIds: json<{ addedSourceIds?: string[] }>(r.meta, {}).addedSourceIds ?? [],
    addedQas: json<{ addedQas?: AgentVersion["addedQas"] }>(r.meta, {}).addedQas ?? [],
    ...(json<{ improvement?: AgentVersion["improvement"] }>(r.meta, {}).improvement ? { improvement: json<{ improvement: NonNullable<AgentVersion["improvement"]> }>(r.meta, { improvement: { id: "", fixes: [] } }).improvement } : {}),
    ...(r.author_id ? { authorId: r.author_id } : {}),
    createdAt: r.created_at,
  };
};

/** Saves the agent as it is now, unless nothing changed since the last version. */
export async function saveVersion(agentId: string, input: { label: string; origin: VersionOrigin; authorId?: string; addedQas?: AgentVersion["addedQas"]; improvement?: AgentVersion["improvement"] }): Promise<AgentVersion | undefined> {
  const snapshot = await snapshotOf(agentId);
  if (!snapshot) return undefined;
  const fingerprint = fingerprintOf(snapshot);
  const last = await db().prepare("SELECT fingerprint FROM agent_versions WHERE agent_id = ? ORDER BY created_at DESC, seq DESC LIMIT 1").get<{ fingerprint?: string }>(agentId);
  if (last?.fingerprint === fingerprint && !input.addedQas?.length) return undefined;
  const id = newId("ver");
  const stored = { ...snapshot, config: keptConfig(snapshot.config), actions: sealActions(agentId, snapshot.actions, false) };
  await db()
    .prepare("INSERT INTO agent_versions (id, agent_id, label, origin, snapshot, fingerprint, meta, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, agentId, input.label.slice(0, 200), input.origin, JSON.stringify(stored), fingerprint, JSON.stringify({ addedSourceIds: (input.addedQas ?? []).map((q) => q.sourceId), addedQas: input.addedQas ?? [], ...(input.improvement ? { improvement: input.improvement } : {}) }), input.authorId ?? null, now());
  return getVersion(id);
}

export async function getVersion(id: string): Promise<AgentVersion | undefined> {
  const row = (await db().prepare("SELECT * FROM agent_versions WHERE id = ?").get(id)) as Row | undefined;
  return row ? toVersion(row) : undefined;
}

export async function listVersions(agentId: string, limit = 50): Promise<AgentVersion[]> {
  return ((await db().prepare("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY created_at DESC, seq DESC LIMIT ?").all(agentId, limit)) as Row[]).map(toVersion);
}

/** Writes a snapshot onto the agent: its settings, and exactly its actions and procedures. */
export async function writeSnapshot(agentId: string, snapshot: AgentSnapshot): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent) return;
  await transaction(async () => {
    await updateAgent(agentId, { name: snapshot.name, config: { ...keptConfig(snapshot.config), resync: { ...agent.config.resync, every: snapshot.config.resync.every }, setupSkipped: agent.config.setupSkipped } });
    const keepActions = new Set(snapshot.actions.map((a) => a.id));
    for (const a of await listActions(agentId)) if (!keepActions.has(a.id)) await deleteAction(a.id);
    for (const a of snapshot.actions) await restoreAction({ ...a, agentId });
    const keepProcedures = new Set(snapshot.procedures.map((p) => p.id));
    for (const p of await listProcedures(agentId)) if (!keepProcedures.has(p.id)) await deleteProcedure(agentId, p.id);
    for (const p of snapshot.procedures) await restoreProcedure({ ...p, agentId });
  });
}

/**
 * Puts the agent back as it was in a version. What it is now is saved first, so the restore can itself be undone; the
 * Q&As that improvements added after that version are removed.
 */
export async function restoreVersion(agentId: string, versionId: string, authorId?: string): Promise<{ ok: boolean; removedSources: number }> {
  const version = await getVersion(versionId);
  if (!version || version.agentId !== agentId) return { ok: false, removedSources: 0 };
  await saveVersion(agentId, { label: "Before restoring an earlier version", origin: "restore", authorId });
  const all = (await db().prepare("SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY created_at, seq").all<Row>(agentId)).map(toVersion);
  const at = all.findIndex((v) => v.id === version.id);
  const added = all.slice(at + 1).flatMap((v) => v.addedSourceIds);
  for (const sourceId of added) await deleteSource(sourceId);
  // Q&As that improvements up to this version added, and a later restore removed, come back.
  for (const v of all.slice(0, at + 1)) {
    if (!v.addedQas.length) continue;
    const qas: AgentVersion["addedQas"] = [];
    for (const q of v.addedQas) {
      if (await getSource(q.sourceId)) {
        qas.push(q);
        continue;
      }
      const source = await addSource(agentId, { kind: "qa", title: q.question, content: qaText(q.question, q.answer) });
      await queueTraining(source.id);
      qas.push({ ...q, sourceId: source.id });
    }
    await db().prepare("UPDATE agent_versions SET meta = ? WHERE id = ?").run(JSON.stringify({ addedSourceIds: qas.map((q) => q.sourceId), addedQas: qas, ...(v.improvement ? { improvement: v.improvement } : {}) }), v.id);
  }
  await writeSnapshot(agentId, version.snapshot);
  // Improvements after this version are undone: they aren't proposed again. Those up to it are back in place.
  for (const v of all.slice(at + 1)) {
    for (const [i, f] of (v.improvement?.fixes ?? []).entries()) await rememberDecision(agentId, `${v.improvement!.id}:undone:${i}`, { kind: "undone", text: `You undid "${f.hypothesis}" (restored an earlier version).`, tests: f.tests, fix: f.fix, session: v.improvement!.id });
  }
  for (const v of all.slice(0, at + 1)) for (const [i] of (v.improvement?.fixes ?? []).entries()) await forgetLesson(agentId, `${v.improvement!.id}:undone:${i}`);
  await saveVersion(agentId, { label: `Restored "${version.label}"`, origin: "restore", authorId });
  return { ok: true, removedSources: added.length };
}
