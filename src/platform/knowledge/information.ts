// The business's own information as one text, for the models that check the agent's work: the test writer, the
// judges and the improvement agent. They read what the agent reads (its profile and its knowledge), whole whenever it
// fits, so a test is written from the real facts and a judge can tell a correct answer from an invented one. Only
// past the budget is it narrowed: to the passages that bear on a conversation, or, to write tests, an even share of
// every source.

import type { Agent } from "@/core/agents";
import { aboutLines } from "../chat/answer";
import { findPassages } from "../chat/retrieve";
import { agentChunks, type StoredChunk } from "../store";

type Piece = { sourceId: string; title: string; section?: string; text: string };

const heading = (p: Piece) => [p.title, p.section].filter(Boolean).join(" › ");

/** Pieces as text, each under its source's heading (said once for pieces in a row from the same place). */
function render(pieces: Piece[]): string {
  let last = "";
  return pieces
    .map((p) => {
      const h = heading(p);
      const line = h === last ? p.text : `### ${h}\n${p.text}`;
      last = h;
      return line;
    })
    .join("\n\n");
}

const size = (p: Piece) => p.text.length + heading(p).length + 6;

/** As many pieces as fit in `room`, taken from every source in turn, kept in their order. */
function evenShare(pieces: Piece[], room: number): Piece[] {
  const bySource = new Map<string, number[]>();
  pieces.forEach((p, i) => bySource.set(p.sourceId, [...(bySource.get(p.sourceId) ?? []), i]));
  const queues = [...bySource.values()];
  const taken = new Set<number>();
  let used = 0;
  for (let progress = true; progress; ) {
    progress = false;
    for (const queue of queues) {
      const i = queue.shift();
      if (i === undefined) continue;
      progress = true;
      if (used + size(pieces[i]) > room) continue;
      taken.add(i);
      used += size(pieces[i]);
    }
  }
  return pieces.filter((_, i) => taken.has(i));
}

/**
 * The business's information, at most `budget` characters: the profile, then the knowledge, whole when it fits. Past
 * that, with `focus` (a conversation, a question), the passages that bear on it; without, an even share of every
 * source. `extra` adds a draft's new pieces (the improvement agent's candidate Q&As).
 */
export async function businessInformation(agent: Agent, budget: number, options: { focus?: string; extra?: StoredChunk[] } = {}): Promise<string> {
  const about = aboutLines(agent);
  const head = about.length ? `## About ${agent.name}\n${about.join("\n")}` : "";
  const pieces: Piece[] = [...(await agentChunks(agent.id)), ...(options.extra ?? [])];
  if (!pieces.length) return [head, `## What ${agent.name} knows\n(Nothing yet.)`].filter(Boolean).join("\n\n");
  const room = budget - head.length;
  const whole = pieces.reduce((n, p) => n + size(p), 0);
  const picked =
    whole <= room
      ? pieces
      : options.focus
        ? (await findPassages(agent.id, options.focus, { limit: 16, budget: room, extra: options.extra })).passages
        : evenShare(pieces, room);
  const note = whole <= room ? "" : `\n\n(Part of what ${agent.name} knows: the parts that matter here.)`;
  return [head, `## What ${agent.name} knows\n${render(picked)}${note}`].filter(Boolean).join("\n\n");
}
