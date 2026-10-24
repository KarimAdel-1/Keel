// Embeddings for knowledge search, on Token Factory. Token Factory offers one embedding model (Qwen3-Embedding-8B);
// generation stays on NVIDIA Nemotron. Vectors are cut to 1,024 dimensions (the model supports it): faster to compare
// and a quarter of the storage, with no loss measured on our test sentences. Calls go through the same gateway as
// chat calls, so rate limits and retries are handled the same way.

import { throughGateway } from "./gateway";
import { reportModelCall } from "./llm";
import { setting } from "./settings";

export const EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-8B";
export const EMBEDDING_DIMENSIONS = 1024;
/** USD per million input tokens (Token Factory's price list, 1 Oct 2026). */
const PRICE_PER_MILLION = 0.01;
/** How many texts one request carries: 32 took about 3 s in testing. */
export const EMBED_BATCH = 32;

/** Recently embedded short texts (questions, procedure triggers): asked again, they cost nothing. */
const RECENT_MAX = 2000;
const recent = ((globalThis as unknown as { __keelRecentVectors?: Map<string, number[]> }).__keelRecentVectors ??= new Map());
/** Knowledge passages are embedded once and stored; only short texts are worth remembering. */
const RECENT_TEXT_MAX = 500;
/** A short text being embedded right now: asked for again meanwhile, the same answer is waited for, not paid twice. */
const inFlight = ((globalThis as unknown as { __keelEmbedding?: Map<string, Promise<number[]>> }).__keelEmbedding ??= new Map());

/**
 * Embeds texts in batches. Returns one vector per text, in order, and what it cost. Short texts embedded recently
 * come from memory, and one being embedded already is waited for (a customer's turn starts its question early).
 */
export async function embed(texts: string[], options: { signal?: AbortSignal } = {}): Promise<{ vectors: number[][]; costUsd: number }> {
  if (!texts.length) return { vectors: [], costUsd: 0 };
  const vectors: (number[] | undefined)[] = texts.map((t) => {
    const hit = recent.get(t);
    if (hit) {
      recent.delete(t);
      recent.set(t, hit);
    }
    return hit;
  });
  const missing = [...new Set(texts.filter((_, i) => !vectors[i]))];
  if (!missing.length) return { vectors: vectors as number[][], costUsd: 0 };
  const running = missing.length === 1 ? inFlight.get(missing[0]) : undefined;
  if (running) {
    const vector = await running;
    return { vectors: texts.map((_, i) => vectors[i] ?? vector), costUsd: 0 };
  }
  const work = embedNow(missing, options);
  if (missing.length === 1 && missing[0].length <= RECENT_TEXT_MAX) {
    const text = missing[0];
    const shared = work.then((r) => r.vectors[0]);
    // Handled here too, so a failure nobody else waited for is never an unhandled rejection.
    shared.catch(() => {});
    inFlight.set(text, shared);
    void work.finally(() => inFlight.delete(text)).catch(() => {});
  }
  const fresh = await work;
  const byText = new Map(missing.map((t, i) => [t, fresh.vectors[i]]));
  for (const t of missing) {
    if (t.length > RECENT_TEXT_MAX) continue;
    recent.set(t, byText.get(t)!);
    if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value!);
  }
  return { vectors: texts.map((t, i) => vectors[i] ?? byText.get(t)!), costUsd: fresh.costUsd };
}

async function embedNow(texts: string[], options: { signal?: AbortSignal }): Promise<{ vectors: number[][]; costUsd: number }> {
  const base = setting("NEBIUS_BASE_URL");
  const apiKey = setting("NEBIUS_API_KEY");
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set (see .env.example)");
  const vectors: number[][] = [];
  let tokens = 0;
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const result = await throughGateway(`${base}|${EMBEDDING_MODEL}`, async () => {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
        signal: options.signal ?? AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const error = new Error(`Token Factory embeddings answered ${res.status}: ${(await res.text()).slice(0, 200)}`) as Error & { status: number };
        error.status = res.status;
        throw error;
      }
      const body = (await res.json()) as { data: { index: number; embedding: number[] }[]; usage?: { prompt_tokens?: number } };
      return { value: body, headers: res.headers };
    });
    for (const item of [...result.data].sort((a, b) => a.index - b.index)) vectors.push(item.embedding);
    tokens += result.usage?.prompt_tokens ?? 0;
  }
  const costUsd = (tokens * PRICE_PER_MILLION) / 1_000_000;
  reportModelCall({ task: "embed", model: EMBEDDING_MODEL, inputTokens: tokens, outputTokens: 0, costUsd });
  return { vectors, costUsd };
}

/** Cosine similarity of two vectors of the same length. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
