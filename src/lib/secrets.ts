// Secrets at rest. A saved agent's API key, header values, auth secrets and alert signing secret are sealed with
// AES-256-GCM before they touch disk, each bound to where it belongs (its agent and field), so a sealed value copied
// into another agent or field won't open. The master key comes from KEEL_SECRET_KEY (32 bytes, base64 or hex);
// without it, from a key file in the data folder created on first use with owner-only permissions. Back the key up
// separately from the data: a copy of the data alone can't be read, and neither can the data without the key.

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { userDataDir } from "./paths";
import { setting } from "./settings";

/** What a sealed value starts with; the version lets the scheme change without breaking stored data. */
export const SEALED_PREFIX = "enc:v1:";

export const isSealed = (value: unknown): value is string => typeof value === "string" && value.startsWith(SEALED_PREFIX);

/** A 32-byte key from base64 or hex, or undefined when it isn't one. */
export function decodeKey(raw: string): Buffer | undefined {
  const text = raw.trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
  try {
    const bytes = Buffer.from(text, "base64");
    if (bytes.length === 32) return bytes;
  } catch {
    // not base64
  }
  return undefined;
}

const keyFile = () => userDataDir("secret.key");
let cached: { from: string; key: Buffer } | undefined;

/** Where the master key comes from, and the key itself. Created (owner-only) the first time none exists. */
export function masterKey(): { key: Buffer; source: "env" | "file" } {
  // setting() refuses a value that isn't 32 bytes.
  const env = setting("KEEL_SECRET_KEY");
  if (env) return { key: decodeKey(env)!, source: "env" };
  const file = keyFile();
  if (cached?.from === file) return { key: cached.key, source: "file" };
  let key: Buffer | undefined;
  if (existsSync(file)) {
    key = decodeKey(readFileSync(file, "utf8"));
    if (!key) throw new Error(`${file} doesn't hold a valid key`);
    // Tighten permissions left open by a copy or a restore.
    if ((statSync(file).mode & 0o077) !== 0) chmodSync(file, 0o600);
  } else {
    key = randomBytes(32);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, key.toString("base64"), { mode: 0o600 });
  }
  cached = { from: file, key };
  return { key, source: "file" };
}

/** A short, safe fingerprint of the key, for messages: never the key. */
export const keyFingerprint = (key: Buffer) => createHash("sha256").update(key).digest("hex").slice(0, 12);

/** Seals a secret for one place (e.g. "agt_123/target.apiKey"). Sealed and empty values pass through. */
export function sealSecret(value: string, place: string): string {
  if (!value || isSealed(value)) return value;
  const { key } = masterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(place));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${SEALED_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export class SecretUnreadable extends Error {}

/** Opens a sealed secret for the place it was sealed for. Plain values (stored before sealing existed) pass through. */
export function openSecret(value: string, place: string): string {
  if (!isSealed(value)) return value;
  const { key } = masterKey();
  const raw = Buffer.from(value.slice(SEALED_PREFIX.length), "base64url");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(place));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretUnreadable(
      `A saved secret for ${place.split("/")[0]} can't be read with the current key (fingerprint ${keyFingerprint(key)}): the key changed since it was saved. Re-enter it.`,
    );
  }
}
