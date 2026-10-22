import { ArrowRight, BookOpen, Bot, Globe, MessagesSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { AgentAvatar, Pill } from "@/components/ui";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { requireUser } from "@/platform/session";
import { agentSummaries, type AgentSummary } from "@/platform/store";

export const metadata: Metadata = { title: "Your agents" };

const FIRST_STEPS = [
  { icon: Globe, title: "Paste your website", text: "Keel reads it and drafts your agent: what you do, what you offer, how you talk." },
  { icon: BookOpen, title: "Check it and add more", text: "Change anything that's off, and add documents or questions and answers." },
  { icon: MessagesSquare, title: "Try it, then go live", text: "Chat with it, see where every answer comes from, and put it on your site." },
];

export default async function AgentsPage() {
  const { user, workspace } = await requireUser();
  const agents = (await agentSummaries(workspace.id));

  if (!agents.length) {
    return (
      <>
        <PageBar icon={<Bot className="size-[18px]" />} title="Agents" />
        <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-[-0.025em]">Welcome, {user.name.split(" ")[0]}. Let&apos;s build your first agent.</h1>
            <p className="mx-auto mt-3 max-w-xl text-muted">An AI agent that answers your customers from your own information, any time of day. It takes a few minutes.</p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {FIRST_STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="card p-5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="eyebrow">Step {i + 1}</span>
                </div>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link href="/app/agents/new" className="btn btn-primary px-6 py-3 text-base">
              Create your first agent <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageBar
        icon={<Bot className="size-[18px]" />}
        title="Agents"
        actions={
          <Link href="/app/agents/new" className="btn btn-primary">
            <Plus className="size-4" /> New agent
          </Link>
        }
      />
      <PageBody>
        <p className="text-sm text-muted">Each agent answers for one business or team, from what you&apos;ve taught it.</p>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <li key={agent.id}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      </PageBody>
    </>
  );
}

function AgentCard({ agent }: { agent: AgentSummary }) {
  const needsKnowledge = agent.sources === 0;
  const href = needsKnowledge ? `/app/agents/${agent.id}/setup/learn` : `/app/agents/${agent.id}`;
  return (
    <Link href={href} className="card group flex h-full flex-col p-5 transition hover:border-line-strong hover:shadow-raised">
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.config.appearance.displayName} color={agent.config.appearance.color} src={agent.config.appearance.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{agent.name}</p>
          <p className="truncate text-sm text-muted">{INDUSTRY_PRESETS[agent.config.industry].label}</p>
        </div>
        {needsKnowledge ? <Pill tone="warn">Needs knowledge</Pill> : !agent.enabled ? <Pill>Off</Pill> : <Pill tone="good">Ready</Pill>}
      </div>
      <div className="mt-5 flex items-center justify-between text-sm text-muted">
        <span>
          {needsKnowledge ? "Finish setting it up" : `${agent.readySources} source${agent.readySources === 1 ? "" : "s"} · ${agent.conversations} chat${agent.conversations === 1 ? "" : "s"}`}
        </span>
        <ArrowRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-text" />
      </div>
    </Link>
  );
}
