// Finding the passages of an agent's knowledge that answer a question. Keyword search (BM25) and embedding search run
// together and their rankings are fused; keywords are instant and exact on names, codes and numbers, embeddings find
// the same meaning in other words. If the embedding call is slow (Token Factory's took from 1.5 to 56 seconds in our
// measurements), keywords answer alone when they clearly match; when they don't, the search waits longer for the
// meaning, because an answer worded differently from the question ("a message with a present" for "a handwritten
// note") is found only by meaning, and a correct answer a few seconds later beats a fast "I don't know".

import type { Passage } from "@/core/agents";
import { bm25, fuse, terms } from "@/core/search";
import { cosine, embed } from "@/lib/embeddings";
import { agentChunks, type StoredChunk } from "../store";

/** How long a question's embedding may take before keywords that clearly match answer alone. */
export const EMBED_WAIT_MS = 2500;
/** How long it may take when keywords alone don't clearly match. */
export const EMBED_WAIT_WEAK_MS = 15_000;
/** A keyword match this strong (BM25, as 0 to 1) answers alone when the meaning search is slow. */
const STRONG_KEYWORDS = 0.6;

const termsCache = new WeakMap<StoredChunk[], string[][]>();

function chunkTerms(chunks: StoredChunk[]): string[][] {
  const cached = termsCache.get(chunks);
  if (cached) return cached;
  const list = chunks.map((c) => terms(`${c.title} ${c.section ?? ""} ${c.text}`));
  termsCache.set(chunks, list);
  return list;
}

const within = <T>(work: Promise<T>, ms: number) => Promise.race([work, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms).unref?.())]);

/** The question's embedding: waited for briefly when keywords clearly match, longer when they don't. */
async function questionVector(question: string, keywordsStrong: boolean): Promise<{ vector?: number[]; costUsd: number }> {
  try {
    const work = embed([question]);
    const result = (await within(work, EMBED_WAIT_MS)) ?? (keywordsStrong ? undefined : await within(work, EMBED_WAIT_WEAK_MS - EMBED_WAIT_MS));
    return result ? { vector: result.vectors[0], costUsd: result.costUsd } : { costUsd: 0 };
  } catch {
    return { costUsd: 0 };
  }
}

export interface Found {
  passages: Passage[];
  /** Whether embeddings took part (false: keywords only). */
  usedMeaning: boolean;
  /** How closely the best passage matches the question, 0 to 1: the strongest of meaning and keyword match. */
  relevance: number;
  /** The question's embedding, when it was made: other checks reuse it instead of embedding the question again. */
  vector?: number[];
  costUsd: number;
}

/** The best passages for a question, within a character budget: what the agent answers from. */
export async function findPassages(agentId: string, question: string, options: { limit?: number; budget?: number; extra?: StoredChunk[] } = {}): Promise<Found> {
  const limit = options.limit ?? 6;
  const budget = options.budget ?? 7000;
  // A draft's extra Q&As are searched alongside the saved knowledge.
  const saved = await agentChunks(agentId);
  const chunks = options.extra?.length ? [...saved, ...options.extra] : saved;
  if (!chunks.length || !question.trim()) return { passages: [], usedMeaning: false, relevance: 0, costUsd: 0 };

  const keywordScores = bm25(question, chunkTerms(chunks));
  const byKeywords = keywordScores
    .map((score, i) => ({ i, score }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((r) => r.i);

  const rankings = [byKeywords];
  let costUsd = 0;
  let usedMeaning = false;
  let questionVec: number[] | undefined;
  const topKeyword = byKeywords.length ? keywordScores[byKeywords[0]] : 0;
  let relevance = topKeyword / (topKeyword + 4);
  if (chunks.some((c) => c.embedding)) {
    const { vector, costUsd: cost } = await questionVector(question, relevance >= STRONG_KEYWORDS);
    costUsd = cost;
    if (vector) {
      usedMeaning = true;
      questionVec = vector;
      const byMeaning = chunks
        .map((c, i) => ({ i, score: c.embedding ? cosine(vector, c.embedding) : -1 }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);
      relevance = Math.max(relevance, byMeaning[0]?.score ?? 0);
      rankings.push(byMeaning.map((r) => r.i));
    }
  }

  const passages: Passage[] = [];
  let used = 0;
  for (const i of fuse(rankings)) {
    const c = chunks[i];
    if (passages.length >= limit) break;
    if (used + c.text.length > budget && passages.length) continue;
    used += c.text.length;
    passages.push({ chunkId: c.id, sourceId: c.sourceId, title: c.title, ...(c.url ? { url: c.url } : {}), ...(c.section ? { section: c.section } : {}), text: c.text });
  }
  return { passages, usedMeaning, relevance: Math.min(1, relevance), ...(questionVec ? { vector: questionVec } : {}), costUsd };
}
