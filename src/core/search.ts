// Ranking passages for a question without a model: BM25 over content words, and the fusion of several rankings
// (keywords and embeddings) by reciprocal rank. Keyword search is instant and exact on names, codes and numbers;
// embeddings find the same meaning in other words. Together they beat either alone, and keywords still answer when
// an embedding call is slow.

import { STOP, stem } from "./text";

const K1 = 1.2;
const B = 0.75;

/**
 * Words as search terms, in any language and as often as they occur (BM25 needs how often a passage says a word):
 * lower-cased and stemmed, without filler words; numbers and codes kept ("24", "PW-1043" whole and in parts); short
 * words like "UK" and "EU" count.
 */
export function terms(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+(?:[-_/.][\p{L}\p{N}]+)*/gu) ?? []) {
    const parts = raw.split(/[-_/.]/);
    if (parts.length > 1) out.push(raw);
    for (const part of parts) {
      if (/^\d+$/.test(part)) out.push(part);
      else if (part.length >= 2 && !STOP.has(part)) out.push(stem(part));
    }
  }
  return out;
}

/** BM25 scores of each document for the query, in document order. */
export function bm25(query: string, documents: string[][]): number[] {
  const q = [...new Set(terms(query))];
  if (!q.length || !documents.length) return documents.map(() => 0);
  const avg = documents.reduce((n, d) => n + d.length, 0) / documents.length || 1;
  const df = new Map<string, number>();
  for (const doc of documents) for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  return documents.map((doc) => {
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const n = df.get(t) ?? 0;
      const idf = Math.log(1 + (documents.length - n + 0.5) / (n + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / avg)));
    }
    return score;
  });
}

/**
 * Reciprocal rank fusion: each ranking (best first, ids only) gives an item 1 / (k + rank). Items found by several
 * rankings rise; one ranking alone still counts. Returns ids best first.
 */
export function fuse<T>(rankings: T[][], k = 60): T[] {
  const score = new Map<T, number>();
  for (const ranking of rankings) ranking.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
