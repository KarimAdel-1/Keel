// API keys for the REST API: a workspace's systems talk to its agents with a key. Only the key's hash is kept; the key
// itself is shown once, when it's made. Keys look like "keel_sk_" and 40 characters.

import { createHash, randomBytes } from "node:crypto";
import { db, system } from "@/lib/db";
import { newId, now } from "@/lib/rows";

export interface ApiKey {
  id: string;
  workspaceId: string;
  name: string;
  /** The first characters, to recognise it. */
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

const hash = (key: string) => createHash("sha256").update(key).digest("hex");

export async function listKeys(workspaceId: string): Promise<ApiKey[]> {
  return (await db().prepare("SELECT id, workspace_id, name, prefix, created_at, last_used_at FROM api_keys WHERE workspace_id = ? ORDER BY created_at").all<{
    id: string;
    workspace_id: string;
    name: string;
    prefix: string;
    created_at: string;
    last_used_at: string | null;
  }>(workspaceId)).map((k) => ({ id: k.id, workspaceId: k.workspace_id, name: k.name, prefix: k.prefix, createdAt: k.created_at, ...(k.last_used_at ? { lastUsedAt: k.last_used_at } : {}) }));
}

/** Makes a key. The returned `key` is the only time it can be seen. */
export async function createKey(workspaceId: string, name: string): Promise<{ key: string; apiKey: ApiKey }> {
  const key = `keel_sk_${randomBytes(30).toString("base64url")}`;
  const id = newId("key");
  await db().prepare("INSERT INTO api_keys (id, workspace_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, workspaceId, name.slice(0, 80) || "API key", key.slice(0, 14), hash(key), now());
  return { key, apiKey: (await listKeys(workspaceId)).find((k) => k.id === id)! };
}

export async function deleteKey(workspaceId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM api_keys WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
}

/**
 * The workspace a key belongs to, from an "Authorization: Bearer …" header. The key is what says which business it
 * is, so it's looked up across businesses; only a key's hash matches.
 */
export async function workspaceForKey(header: string | null): Promise<string | undefined> {
  const key = header?.match(/^Bearer\s+(keel_sk_[\w-]+)$/)?.[1];
  if (!key) return undefined;
  const row = await system().prepare("SELECT id, workspace_id FROM api_keys WHERE key_hash = ?").get<{ id: string; workspace_id: string }>(hash(key));
  if (!row) return undefined;
  await system().prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(now(), row.id);
  return row.workspace_id;
}
