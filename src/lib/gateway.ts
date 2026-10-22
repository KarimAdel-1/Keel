// Every call Keel makes to Token Factory goes through a lane for its model:
//
// - a slot queue caps how many calls are in flight, in order, and gives up after QUEUE_TIMEOUT_MS instead of waiting
//   forever;
// - the cap adapts: halved on a rate limit, raised by half again after a run of successes (up to where it started),
//   and lowered early when the rate-limit headers say little is left;
// - failed calls are retried with exponential backoff and jitter, honouring the server's Retry-After. Quota and billing
//   errors, and requests that are simply wrong (400, 401, 403, 404), are never retried;
// - calls at a low temperature (judgements, classifications) can be cached when KEEL_CACHE=1, so asking the same
//   question about the same text again costs nothing and gives the same answer. Customer replies and the customers
//   played in tests are never cached: repeated test runs must really vary to mean anything.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { userDataDir } from "./paths";
import { setting } from "./settings";

export const GATEWAY = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  jitter: 0.2,
  queueTimeoutMs: 5 * 60_000,
  recoverAfter: 5,
  warnBelow: 0.1,
  cacheTtlMs: 14 * 24 * 60 * 60_000,
  cacheEntries: 2000,
};

/** A call gave up in the queue or ran out of retries: Keel's side, not the agent's. */
export class GatewayError extends Error {
  readonly name = "GatewayError";
}

type HeaderSource = Headers | Record<string, string | undefined> | undefined;
const header = (h: HeaderSource, name: string): string | undefined =>
  !h ? undefined : typeof (h as Headers).get === "function" ? ((h as Headers).get(name) ?? undefined) : (h as Record<string, string | undefined>)[name];

/** What an error says about retrying: the HTTP status, the server's Retry-After, and whether it's a hard quota. */
export function classify(error: unknown): { retry: boolean; rateLimited: boolean; retryAfterMs?: number } {
  const e = (error ?? {}) as { status?: number; headers?: HeaderSource; code?: string; message?: string; name?: string; cause?: { code?: string } };
  const message = `${e.message ?? ""} ${e.code ?? ""}`.toLowerCase();
  const status = typeof e.status === "number" ? e.status : undefined;
  const quota = /insufficient_quota|billing|quota exceeded|exceeded your current quota|credit balance/.test(message);
  const afterMs = Number(header(e.headers, "retry-after-ms"));
  const after = header(e.headers, "retry-after");
  const retryAfterMs = Number.isFinite(afterMs) && afterMs >= 0 ? afterMs : after ? parseRetryAfter(after) : undefined;
  if (quota) return { retry: false, rateLimited: false };
  if (status === 429) return { retry: true, rateLimited: true, retryAfterMs };
  if (status !== undefined) return { retry: status === 408 || status === 409 || status >= 500, rateLimited: false, retryAfterMs };
  // No status: a connection problem or a timeout, worth another try.
  const network = /timeout|timed out|econnreset|econnrefused|etimedout|socket hang up|network|fetch failed|eai_again|epipe/.test(message) ||
    /APIConnection(Timeout)?Error/.test(e.name ?? "") || /ECONNRESET|ETIMEDOUT|ECONNREFUSED/.test(e.cause?.code ?? "");
  return { retry: network, rateLimited: false };
}

/** Retry-After as seconds or an HTTP date, in milliseconds from now. */
export function parseRetryAfter(value: string, now = Date.now()): number | undefined {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}

/** How long to wait before attempt `attempt + 1`: the server's word first, else exponential backoff with jitter. */
export function retryDelay(attempt: number, retryAfterMs?: number, random = Math.random): number {
  if (retryAfterMs !== undefined) {
    if (retryAfterMs === 0) return 0;
    return Math.min(retryAfterMs + retryAfterMs * GATEWAY.jitter * random(), GATEWAY.maxDelayMs);
  }
  const base = GATEWAY.baseDelayMs * 2 ** attempt;
  return Math.min(base + base * GATEWAY.jitter * random(), GATEWAY.maxDelayMs);
}

export interface LaneStats {
  calls: number;
  retries: number;
  rateLimited: number;
  cacheHits: number;
  failed: number;
  concurrency: number;
  startConcurrency: number;
  active: number;
  queued: number;
}

/** One model's queue and its adaptive concurrency. */
export class Lane {
  private active = 0;
  private waiting: { go: () => void; fail: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }[] = [];
  private streak = 0;
  concurrency: number;
  readonly stats: Omit<LaneStats, "concurrency" | "startConcurrency" | "active" | "queued"> = { calls: 0, retries: 0, rateLimited: 0, cacheHits: 0, failed: 0 };

  constructor(
    readonly start: number,
    private readonly queueTimeoutMs = GATEWAY.queueTimeoutMs,
  ) {
    this.concurrency = Math.max(1, start);
  }

  acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      const entry: (typeof this.waiting)[number] = {
        go: () => {
          if (entry.timer) clearTimeout(entry.timer);
          this.active++;
          resolve();
        },
        fail: reject,
      };
      if (this.queueTimeoutMs > 0) {
        entry.timer = setTimeout(() => {
          const at = this.waiting.indexOf(entry);
          if (at >= 0) {
            this.waiting.splice(at, 1);
            reject(new GatewayError(`The model queue was full for ${Math.round(this.queueTimeoutMs / 1000)}s`));
          }
        }, this.queueTimeoutMs);
        entry.timer.unref?.();
      }
      this.waiting.push(entry);
      this.drain();
    });
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    this.drain();
  }

  private drain() {
    while (this.active < this.concurrency && this.waiting.length) this.waiting.shift()!.go();
  }

  succeeded() {
    this.streak++;
    if (this.streak >= GATEWAY.recoverAfter && this.concurrency < this.start) {
      this.concurrency = Math.min(this.start, Math.ceil(this.concurrency * 1.5));
      this.streak = 0;
      this.drain();
    }
  }

  rateLimited() {
    this.streak = 0;
    this.stats.rateLimited++;
    this.concurrency = Math.max(1, Math.floor(this.concurrency / 2));
  }

  /** The server says how much is left: slow down before hitting the wall. */
  remaining(left: number, limit: number) {
    if (!(limit > 0) || left < 0) return;
    const ratio = left / limit;
    if (ratio >= GATEWAY.warnBelow) return;
    const factor = 0.2 + (Math.max(0, ratio) / GATEWAY.warnBelow) * 0.4;
    this.concurrency = Math.max(1, Math.min(this.concurrency, Math.floor(this.start * factor)));
  }

  snapshot(): LaneStats {
    return { ...this.stats, concurrency: this.concurrency, startConcurrency: this.start, active: this.active, queued: this.waiting.length };
  }
}

const globalLanes = globalThis as unknown as { __keelLanes?: Map<string, Lane> };
const lanes: Map<string, Lane> = (globalLanes.__keelLanes ??= new Map<string, Lane>());

const startConcurrency = () => setting("MODEL_CONCURRENCY");

export function laneFor(key: string): Lane {
  let lane = lanes.get(key);
  if (!lane) {
    lane = new Lane(startConcurrency());
    lanes.set(key, lane);
  }
  return lane;
}

// --- Cache (opt-in) ---

export const cacheEnabled = () => setting("KEEL_CACHE");

/** A stable key for a request: the same model, messages and parameters give the same key. */
export const cacheKeyOf = (request: unknown) => createHash("sha256").update(JSON.stringify(request)).digest("hex");

const memory = new Map<string, { at: number; value: unknown }>();
const cacheFile = (key: string) => userDataDir("cache", key.slice(0, 2), `${key}.json`);

async function cacheGet<T>(key: string): Promise<T | undefined> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && now - hit.at < GATEWAY.cacheTtlMs) return hit.value as T;
  try {
    const stored = JSON.parse(await readFile(cacheFile(key), "utf8")) as { at: number; value: T };
    if (now - stored.at >= GATEWAY.cacheTtlMs) return undefined;
    memory.set(key, stored);
    return stored.value;
  } catch {
    return undefined;
  }
}

async function cacheSet(key: string, value: unknown) {
  const entry = { at: Date.now(), value };
  memory.set(key, entry);
  if (memory.size > GATEWAY.cacheEntries) memory.delete(memory.keys().next().value!);
  try {
    const file = cacheFile(key);
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, JSON.stringify(entry));
    await rename(temp, file);
  } catch {
    // A cache that can't be written only costs a later repeat.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a model call through its lane: queued, retried, adapted to rate limits, and cached when a cache key is given.
 * `call` returns the value and, when it has them, the response headers (for the rate-limit counters).
 */
export async function throughGateway<T>(
  laneKey: string,
  call: () => Promise<{ value: T; headers?: HeaderSource }>,
  options: { cacheKey?: string; wait?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const lane = laneFor(laneKey);
  if (options.cacheKey) {
    const cached = await cacheGet<T>(options.cacheKey);
    if (cached !== undefined) {
      lane.stats.cacheHits++;
      return cached;
    }
  }
  const wait = options.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    await lane.acquire();
    let delay = 0;
    try {
      lane.stats.calls++;
      const { value, headers } = await call();
      lane.succeeded();
      lane.remaining(Number(header(headers, "x-ratelimit-remaining-requests")), Number(header(headers, "x-ratelimit-limit-requests")));
      if (options.cacheKey) await cacheSet(options.cacheKey, value);
      return value;
    } catch (error) {
      const verdict = classify(error);
      if (verdict.rateLimited) lane.rateLimited();
      if (!verdict.retry || attempt + 1 >= GATEWAY.maxAttempts) {
        lane.stats.failed++;
        throw error;
      }
      lane.stats.retries++;
      delay = retryDelay(attempt, verdict.retryAfterMs);
    } finally {
      lane.release();
    }
    await wait(delay);
  }
}
