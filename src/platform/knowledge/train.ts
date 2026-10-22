// Training an agent on a source: its text cut into passages that keep their section, each passage embedded for
// search. A source whose embeddings fail still trains, searchable by keywords, and says so.

import { splitSource } from "@/core/source";
import type { SourceKind } from "@/core/agents";
import { embed } from "@/lib/embeddings";
import { getSource, replaceChunks, setSourceStatus, sourceContent } from "../store";

/** About a few paragraphs: small enough to be precise, big enough to carry their context. */
export const CHUNK_CHARS = 1200;
const MIN_CHUNK_CHARS = 20;

/** A source's text as passages, each with the heading it sits under. */
export function chunkSource(kind: SourceKind, title: string, content: string): { text: string; section?: string }[] {
  if (kind === "qa") return content.trim() ? [{ text: content.trim() }] : [];
  return splitSource(`# Source: ${title}\n\n${content}`, CHUNK_CHARS)
    .map((c) => ({ text: c.text.replace(/^# Source:.*\n*/m, "").trim(), ...(c.section ? { section: c.section } : {}) }))
    .filter((c) => c.text.length >= MIN_CHUNK_CHARS);
}

/** What a passage is embedded as: where it sits, then its text. */
export const embeddingInput = (title: string, chunk: { text: string; section?: string }) =>
  `${title}${chunk.section ? ` › ${chunk.section}` : ""}\n${chunk.text}`;

export async function trainSource(sourceId: string): Promise<{ chunks: number; costUsd: number; keywordsOnly: boolean }> {
  const source = await getSource(sourceId);
  if (!source) throw new Error(`No source ${sourceId}`);
  await setSourceStatus(sourceId, "training");
  const chunks = chunkSource(source.kind, source.title, await sourceContent(sourceId));
  if (!chunks.length) {
    await setSourceStatus(sourceId, "failed", "No text found in this source.");
    return { chunks: 0, costUsd: 0, keywordsOnly: false };
  }
  try {
    const { vectors, costUsd } = await embed(chunks.map((c) => embeddingInput(source.title, c)));
    await replaceChunks(sourceId, chunks.map((c, i) => ({ ...c, embedding: vectors[i] })));
    return { chunks: chunks.length, costUsd, keywordsOnly: false };
  } catch (error) {
    await replaceChunks(sourceId, chunks);
    await setSourceStatus(sourceId, "ready", `Searchable by keywords only: embeddings failed (${(error as Error).message.slice(0, 120)}). Retrain to try again.`);
    return { chunks: chunks.length, costUsd: 0, keywordsOnly: true };
  }
}
