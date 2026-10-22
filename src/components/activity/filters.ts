// The choices above the conversations list, shared by the page (to read the address) and the filters (to show them).

export const RANGES = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["all", "All time"],
] as const;
export const SOURCES = [
  ["all", "All sources"],
  ["widget", "Website"],
  ["share", "Chat page"],
  ["api", "API"],
  ["playground", "Try it"],
] as const;
export const SHOWS = [
  ["all", "Everything"],
  ["low", "Low confidence"],
  ["handed_off", "With your team"],
  ["paused", "Paused as spam"],
  ["negative", "Unhappy customers"],
] as const;
