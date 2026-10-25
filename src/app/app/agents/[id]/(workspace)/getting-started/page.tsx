import { ArrowRight, BadgeCheck, BookOpen, Home, LayoutTemplate, MessagesSquare, Play, Sparkles, TestTubes, Zap } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { periodOf } from "@/components/analytics/period";
import { SetupChecklist } from "@/components/setup/SetupChecklist";
import { TodoList } from "@/components/setup/TodoList";
import { BrowserAlertsLoader } from "@/components/shell/BrowserAlertsLoader";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Pill, Stat, timeAgo } from "@/components/ui";
import { chatsSummary } from "@/platform/analysis";
import { listQualityChecks } from "@/platform/quality";
import { requireAgent } from "@/platform/session";
import { setupSteps, todos } from "@/platform/setup";
import { latestRuns, listTests } from "@/platform/tests";

export const metadata: Metadata = { title: "Home" };

/** Read-only overview; editing and reports link to their dedicated pages. */
export default async function AgentHomePage({ params }: PageProps<"/app/agents/[id]/getting-started">) {
  const { agent } = await requireAgent((await params).id);
  const [items, steps, tests, runs, checks, chats] = await Promise.all([
    todos(agent),
    setupSteps(agent),
    listTests(agent.id),
    latestRuns(agent.id),
    listQualityChecks(agent.id, 1),
    chatsSummary(agent.id, periodOf("7")),
  ]);
  const base = `/app/agents/${agent.id}`;
  const passed = tests.filter((t) => runs.get(t.id)?.status === "passed").length;
  const failed = tests.filter((t) => runs.get(t.id)?.status === "failed");
  const other = tests.length - passed - failed.length;
  const check = checks[0];
  const attentionItems = items.map((item) => {
    if (!item.fix) return item;
    const destination = { reach_person: "actions#goals", write_tests: "tests", spam: "guardrails", go_live: "settings" }[item.fix.kind];
    return { ...item, fix: undefined, href: `${base}/${destination}`, cta: "Review settings" };
  });
  const progress = tests.length ? (passed / tests.length) * 100 : 0;
  return (
    <>
      <PageBar icon={<Home className="size-[18px]" />} title={`${agent.name} / Home`} actions={<BrowserAlertsLoader />} />
      <PageBody wide>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
            <p className="mt-1 text-sm text-muted">A clear view of your agent and what to do next.</p>
          </div>
          <Link href={base} className="btn btn-secondary">
            <Play className="size-4" /> Try your agent
          </Link>
        </div>
        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Conversations" value={chats.conversations.toLocaleString()} note="Last 7 days" icon={<MessagesSquare className="size-4" />} />
              <Stat label="Handed to your team" value={chats.handedOver.toLocaleString()} note="Last 7 days" />
              <Stat
                label="Answer quality"
                value={check?.report ? `${check.report.score}/10` : "—"}
                note={check?.report ? `Checked ${timeAgo(check.finishedAt ?? check.createdAt)}` : "Run a quality check"}
                icon={<BadgeCheck className="size-4" />}
              />
              <Stat label="Tests passed" value={`${passed}/${tests.length}`} note="Latest result for each test" icon={<TestTubes className="size-4" />} />
            </div>
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
                <h2 className="font-semibold">Agent test overview</h2>
                <Link href={`${base}/tests`} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                  View tests <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="flex flex-wrap items-center gap-6 p-6">
                <div
                  className="flex size-24 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `conic-gradient(var(--ink) ${progress}%, var(--panel-3) 0)` }}
                  aria-label={`${passed} of ${tests.length} tests passed`}
                >
                  <div className="flex size-20 items-center justify-center rounded-full bg-panel text-xl font-semibold tabular-nums">
                    {passed}/{tests.length}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {tests.length ? `${passed} of ${tests.length} tests passed` : "Your first check starts here"}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    {failed.length
                      ? `${failed.length} tests need a closer look. Review the results before making changes.`
                      : tests.length
                        ? "Open Tests for results, evidence and the next steps."
                        : "Test real customer questions to see where your agent needs help."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Pill tone="good">{passed} passed</Pill>
                    <Pill tone={failed.length ? "warn" : "neutral"}>{failed.length} need attention</Pill>
                    <Pill>{other} pending or not completed</Pill>
                  </div>
                </div>
              </div>
              {failed.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {failed.slice(0, 3).map((t) => (
                    <li key={t.id}>
                      <Link href={`${base}/tests`} className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-panel-2">
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{t.name}</span>
                          <span className="mt-1 block text-xs text-muted">Open the test to review its findings and evidence.</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel-2/40 px-6 py-4">
                <p className="text-xs text-muted">Review suggested changes in Improve before applying them.</p>
                <Link href={`${base}/${failed.length ? "improve" : "quality"}`} className="btn btn-primary text-xs">
                  {failed.length ? "Open Improve" : "Open Quality"}
                </Link>
              </div>
            </section>
            <section>
              <h2 className="font-semibold">Your workspace</h2>
              <p className="mt-1 text-sm text-muted">Each task has its own place.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  { title: "Knowledge", text: "Manage the information your agent answers from.", href: "sources", icon: BookOpen },
                  { title: "Actions", text: "Choose business templates and manage what your agent does.", href: "actions", icon: Zap },
                  { title: "Widgets", text: "Browse templates or design your own rich replies.", href: "widgets", icon: LayoutTemplate },
                ].map(({ title, text, href, icon: Icon }) => (
                  <Link key={href} href={`${base}/${href}`} className="card group p-5 transition hover:border-line-strong">
                    <Icon className="mb-4 size-5 text-muted" />
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted">{text}</p>
                    <span className="mt-4 inline-flex items-center gap-2 text-xs font-medium">
                      Open {title} <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
            <details className="report-detail">
              <summary>
                Getting started · {steps.filter((s) => s.done).length} of {steps.length} complete
              </summary>
              <SetupChecklist agentId={agent.id} steps={steps} />
            </details>
          </div>
          <aside className="space-y-5 xl:border-l xl:border-line xl:pl-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Needs attention</h2>
              <span className="neutral-label">{items.length}</span>
            </div>
            <div className="home-attention">
              <TodoList agentId={agent.id} initial={attentionItems} />
            </div>
            <Link href={`${base}/backstage`} className="btn btn-secondary w-full">
              <Sparkles className="size-4" /> Ask Copilot
            </Link>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
