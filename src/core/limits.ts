// Limits that keep one workspace from overloading the server, and its agents working well. They aren't a price plan:
// Keel has no payments, and spending is shown in dollars, as Token Factory bills it (Usage).

export const LIMITS = {
  /** Agents in one workspace. */
  agents: 20,
  /** Knowledge per agent, in characters of text: past this, new sources are refused. */
  knowledgeChars: 2_000_000,
  /** Actions per agent: with many more, models choose among them less reliably. */
  actionsPerAgent: 10,
  /** People in one workspace. */
  members: 20,
};
