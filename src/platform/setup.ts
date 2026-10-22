// How far an agent's setup has come: ten steps from a new agent to one that's live, tested and watched, each done
// (or skipped by the builder), with where to do it and what it's for. Shown on the Getting started page and as the
// progress card in the sidebar.

import { AGENT_COLORS, type Agent } from "@/core/agents";
import { db } from "@/lib/db";

export interface SetupStep {
  key: string;
  title: string;
  text: string;
  cta: string;
  href: string;
  done: boolean;
  skipped: boolean;
}

const count = async (sql: string, ...args: string[]) => Number((await db().prepare(sql).get<{ n: number }>(...args))?.n ?? 0);

export async function setupSteps(agent: Agent): Promise<SetupStep[]> {
  const base = `/app/agents/${agent.id}`;
  const id = agent.id;
  const [readySources, actions, procedures, testRuns, liveChats, webhooks, apiKeys, readChats, connected] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM sources WHERE agent_id = ? AND status = 'ready'", id),
    count("SELECT COUNT(*) AS n FROM actions WHERE agent_id = ? AND enabled = 1 AND kind != 'followups'", id),
    count("SELECT COUNT(*) AS n FROM procedures WHERE agent_id = ? AND enabled = 1", id),
    count("SELECT COUNT(*) AS n FROM test_runs WHERE agent_id = ? AND status IN ('passed', 'failed')", id),
    count("SELECT COUNT(*) AS n FROM conversations WHERE agent_id = ? AND channel NOT IN ('playground', 'test')", id),
    count("SELECT COUNT(*) AS n FROM webhooks WHERE agent_id = ?", id),
    count("SELECT COUNT(*) AS n FROM api_keys WHERE workspace_id = ?", agent.workspaceId),
    count("SELECT COUNT(*) AS n FROM conversations WHERE agent_id = ? AND (meta::jsonb->>'sentiment') IS NOT NULL", id),
    count("SELECT COUNT(*) AS n FROM integrations WHERE agent_id = ? AND enabled = 1", id),
  ]);
  const skipped = new Set(agent.config.setupSkipped);
  const a = agent.config.appearance;
  const steps: Omit<SetupStep, "skipped">[] = [
    {
      key: "profile",
      title: "Tell it about your business",
      text: "A few lines about what you do, what you offer and who your customers are. It keeps them in mind for every answer.",
      cta: "Write the profile",
      href: `${base}/instructions#about`,
      done: Boolean(agent.config.profile.summary),
    },
    {
      key: "knowledge",
      title: "Teach it what you know",
      text: "Your website, documents, price lists and the questions you get most. It only answers from what you add.",
      cta: "Add knowledge",
      href: `${base}/sources`,
      done: readySources >= 3,
    },
    {
      key: "action",
      title: "Let it do things",
      text: "Open a ticket, hand over to your team, collect leads, or look things up in your own system.",
      cta: "Add an action",
      href: `${base}/actions`,
      done: actions > 0,
    },
    {
      key: "procedure",
      title: "Write a step-by-step guide",
      text: "For requests that need steps in order, like a refund or a booking: the agent follows them.",
      cta: "Add a guide",
      href: `${base}/procedures`,
      done: procedures > 0,
    },
    {
      key: "test",
      title: "Test it with AI customers",
      text: "A crowd of AI customers talks to it, and a judge checks every answer before real customers do.",
      cta: "Run tests",
      href: `${base}/tests`,
      done: testRuns > 0,
    },
    {
      key: "look",
      title: "Make it look like you",
      text: "Your logo, colours, greeting and the questions it suggests.",
      cta: "Change the look",
      href: base,
      done: Boolean(a.avatar) || a.color !== AGENT_COLORS[0] || a.style !== "classic",
    },
    {
      key: "protection",
      title: "Turn on protection",
      text: "Limit how fast one visitor can send messages, stop spam, and choose which websites may show the chat.",
      cta: "Open Safety and limits",
      href: `${base}/guardrails`,
      done: agent.config.protection.spam.enabled || agent.config.protection.allowedDomains.length > 0,
    },
    {
      key: "live",
      title: "Put it on your website",
      text: "A chat bubble, a side panel, a window in a page or a help page of its own: one line of code.",
      cta: "Choose a channel",
      href: `${base}/channels`,
      done: liveChats > 0,
    },
    {
      key: "connect",
      title: "Connect your apps and tools",
      text: "Answer customers on WhatsApp, Messenger, Instagram or Telegram, send handovers to Zendesk, Freshdesk or Slack, or connect your own systems.",
      cta: "Connect an app",
      href: `${base}/integrations`,
      done: connected > 0 || webhooks > 0 || apiKeys > 0,
    },
    {
      key: "review",
      title: "Learn from your conversations",
      text: "See what people ask, how they feel, and the questions it couldn't answer, then improve it.",
      cta: "Open analytics",
      href: `${base}/analytics`,
      done: readChats > 0,
    },
  ];
  return steps.map((s) => ({ ...s, skipped: !s.done && skipped.has(s.key) }));
}

export type TodoFix = "reach_person" | "spam" | "go_live" | "write_tests";

export interface Todo {
  key: string;
  /** How much it matters to customers: 3 = they can be left stuck, 1 = worth doing. */
  weight: 1 | 2 | 3;
  title: string;
  text: string;
  /** A fix Keel can make in one click, or where to fix it. */
  fix?: { kind: TodoFix; label: string };
  href?: string;
  cta?: string;
}

/**
 * What to fix first, in the owner's words: the things that leave customers stuck or the agent wrong, most important
 * first, each with a one-click fix where Keel can make it, or where to go. Computed, not written by a model.
 */
export async function todos(agent: Agent): Promise<Todo[]> {
  const { listActions } = await import("./actions");
  const { listIntegrations } = await import("./integrations");
  const { listSuggestions } = await import("./suggestions");
  const { latestRuns, listTests } = await import("./tests");
  const { sourceSummary } = await import("./store");
  const { membersOf, userSettings } = await import("./accounts");
  const { canSendMail } = await import("@/lib/mail");
  const base = `/app/agents/${agent.id}`;
  const out: Todo[] = [];
  const actions = (await listActions(agent.id)).filter((a) => a.enabled);
  const sources = await sourceSummary(agent.id);
  const integrations = await listIntegrations(agent.id);
  const reachesPerson = actions.some((a) => a.kind === "escalate" || a.kind === "handoff");

  if (!sources.total) out.push({ key: "knowledge", weight: 3, title: "It doesn't know anything about your business yet", text: "Until you add your website or documents, it can only say it doesn't know.", href: `${base}/sources`, cta: "Add knowledge" });
  else if (sources.chars < 3000) out.push({ key: "knowledge", weight: 2, title: "It knows very little", text: `${sources.total} source${sources.total === 1 ? "" : "s"} so far. Add your FAQs, prices and policies so it can answer more.`, href: `${base}/sources`, cta: "Add knowledge" });
  if (!reachesPerson) out.push({ key: "person", weight: 3, title: "Customers can't reach a person", text: "When someone asks for a human, or the agent can't help, they're stuck. Let them reach your team.", fix: { kind: "reach_person", label: "Turn it on" } });
  if (reachesPerson) {
    const members = await membersOf(agent.workspaceId);
    let emailed = 0;
    for (const m of members) if ((await userSettings(m.id)).emailAlerts !== false) emailed++;
    const slack = integrations.some((i) => i.kind === "slack" && i.enabled);
    if (!slack && (!canSendMail() || !emailed)) {
      out.push({
        key: "alerts",
        weight: 3,
        title: "No one hears when a customer needs a person",
        text: canSendMail() ? "Turn on email alerts for someone on your team, or connect Slack." : "This server can't send email yet. Connect Slack, or ask whoever runs Keel to set up email (SMTP_URL).",
        href: canSendMail() ? "/app/workspace" : `${base}/integrations`,
        cta: canSendMail() ? "Turn on alerts" : "Connect Slack",
      });
    }
  }
  for (const i of integrations.filter((x) => x.status === "error" && x.enabled)) {
    out.push({ key: `integration-${i.id}`, weight: 3, title: `${i.kind[0].toUpperCase()}${i.kind.slice(1)} needs attention`, text: `The last message didn't go through: ${i.detail}`, href: `${base}/integrations`, cta: "Check it" });
  }
  const tests = await listTests(agent.id);
  if (!tests.length) out.push({ key: "tests", weight: 2, title: "It hasn't been tested", text: "AI customers ask it what your customers ask, and a judge checks every answer, before real customers do.", fix: { kind: "write_tests", label: "Write and run tests" } });
  else {
    const failed = [...(await latestRuns(agent.id)).values()].filter((r) => r.status === "failed" && tests.some((t) => t.id === r.testId));
    if (failed.length) out.push({ key: "failing", weight: 2, title: `${failed.length} test${failed.length === 1 ? "" : "s"} failed`, text: "The improvement agent can find why and try fixes, keeping only proven ones.", href: `${base}/improve`, cta: "Fix them" });
  }
  const gaps = (await listSuggestions(agent.id)).filter((s) => s.kind === "gap");
  if (gaps.length) out.push({ key: "gaps", weight: 2, title: `${gaps.length} question${gaps.length === 1 ? "" : "s"} customers asked had no good answer`, text: "Answer them once and the agent knows from then on.", href: `${base}/suggestions`, cta: "Answer them" });
  if (!agent.config.profile.summary) out.push({ key: "profile", weight: 1, title: "It doesn't know what your business does", text: "A few lines about what you do and who your customers are improve every answer.", href: `${base}/instructions#about`, cta: "Write it" });
  if (agent.enabled && !agent.config.protection.spam.enabled) out.push({ key: "spam", weight: 1, title: "Spam protection is off", text: "On a public website, it pauses chats that are adverts or abuse, so they don't get answers or waste replies.", fix: { kind: "spam", label: "Turn it on" } });
  if (!agent.enabled) out.push({ key: "live", weight: 2, title: "It's switched off", text: "Visitors and messaging apps get no answers until it's on.", fix: { kind: "go_live", label: "Switch it on" } });
  return out.sort((a, b) => b.weight - a.weight);
}

/** Makes a fix from the to-do list. */
export async function applyTodoFix(agent: Agent, fix: TodoFix): Promise<void> {
  if (fix === "reach_person") {
    const { setGoal } = await import("./goals");
    await setGoal(agent.id, "person", true);
  } else if (fix === "spam") {
    const { updateAgent } = await import("./store");
    await updateAgent(agent.id, { config: { protection: { spam: { ...agent.config.protection.spam, enabled: true } } } });
  } else if (fix === "go_live") {
    const { updateAgent } = await import("./store");
    await updateAgent(agent.id, { enabled: true });
  } else if (fix === "write_tests") {
    const { generateTests, runTests } = await import("./tests");
    const written = await generateTests(agent, 6);
    if (written.length) await runTests(agent.id, written.map((t) => t.id));
  }
}
