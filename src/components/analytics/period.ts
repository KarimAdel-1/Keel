// The periods the analytics pages compare: the last N days against the N days before.

export const ANALYTICS_RANGES = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
] as const;

export const rangeOf = (asked: unknown) => (ANALYTICS_RANGES.some(([k]) => k === asked) ? String(asked) : "30");

/** The period a range means: the last N days up to now. */
export function periodOf(range: string): { from: string; to: string } {
  const days = Number(range) || 30;
  const to = new Date();
  return { from: new Date(to.getTime() - days * 86_400_000).toISOString(), to: to.toISOString() };
}
