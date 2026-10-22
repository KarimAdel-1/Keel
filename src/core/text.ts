// Words that carry meaning, and how much two texts share: the model-free matching behind choosing passages,
// picking the parts of a long source that matter to a call, and neighbours between rules.

export const STOP = new Set(
  "a an and are as at be been but by can could do does for from had has have how if in into is it its may might must no not of on or our shall should so than that the their them then there these they this to was we were what when where which who will with would you your any all each other also only am me my us up hi ok i".split(
    " ",
  ),
);

/** A crude stem, enough for "refunds" to match "refund" and "policies" to match "policy". */
export const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The words that carry meaning, in any language: lowercased, stemmed, without stop words or bare numbers. */
export function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)).map(stem));
}

/** How much two texts share, 0–1 (cosine over their sets of content words). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.sqrt(a.size * b.size);
}

