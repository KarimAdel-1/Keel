// Small helpers every table uses: ids, timestamps, and JSON columns read safely.

import { randomBytes } from "node:crypto";

/** A sortable id with a readable prefix: "act_mur0js62bc2d4766fb1b". */
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;

export const now = () => new Date().toISOString();

/** The moment `days` days ago, as an ISO string. */
export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** A JSON column's value, or `fallback` when it's empty or broken. */
export function json<T>(text: unknown, fallback: T): T {
  try {
    return typeof text === "string" ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The first day of this month (UTC), and of next month: the window spending is counted in. */
export function monthWindow(at = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}
