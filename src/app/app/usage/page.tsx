import { Gauge, Sparkles, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Panel, Stat } from "@/components/ui";
import { tokenCount } from "@/lib/models";
import { monthWindow } from "@/lib/rows";
import { requireUser } from "@/platform/session";
import { listAgents } from "@/platform/store";
import { CREW, crewFor } from "@/platform/crew";
import { usageBreakdown, type UsageKind } from "@/platform/usage";

export const metadata: Metadata = { title: "Usage" };

const KIND: Record<UsageKind, string> = {
  reply: "Answering customers",
  test: "Test runs",
  analysis: "Reading conversations",
  backstage: "Copilot",
  compare: "Comparing instructions",
  draft: "Helpdesk drafts",
  improve: "Improving agents",
  guardrails: "NeMo Guardrails checks",
  security: "Security scans (garak)",
  knowledge: "Learning knowledge",
  quality: "Quality checks",
};

const number = (n: number) => n.toLocaleString("en-GB");
const calls = (n: number) => `${number(n)} call${n === 1 ? "" : "s"}`;

/** Usage: what the workspace's agents used this month, in tokens, and how much Keel saved on its own. */
export default async function UsagePage() {
  const { workspace } = await requireUser();
  const usage = (await usageBreakdown(workspace.id));
  const agents = new Map((await listAgents(workspace.id)).map((a) => [a.id, a]));
  const { start, end } = monthWindow();
  const total = usage.inputTokens + usage.outputTokens;

  const byDay = new Map(usage.days.map((d) => [d.date, d.tokens]));
  const days: { date: string; tokens: number }[] = [];
  for (let t = new Date(start).getTime(); t < new Date(end).getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.push({ date, tokens: byDay.get(date) ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.tokens));
  const fastShare = usage.replies ? Math.round((usage.fastReplies / usage.replies) * 100) : 0;
  const byMember = new Map<string, { tokens: number; calls: number }>();
  for (const t of usage.byTask) {
    const id = crewFor(t.task)?.id ?? "other";
    const row = byMember.get(id) ?? { tokens: 0, calls: 0 };
    byMember.set(id, { tokens: row.tokens + t.tokens, calls: row.calls + t.calls });
  }
  const crew = CREW.filter((m) => byMember.has(m.id)).sort((a, b) => byMember.get(b.id)!.tokens - byMember.get(a.id)!.tokens);

  return (
    <>
      <PageBar icon={<Gauge className="size-[18px]" />} title="Usage" />
      <PageBody>
        <section className="card p-5">
          <p className="text-sm text-muted">Tokens used this month</p>
          <p className="mt-1 text-[28px] font-semibold tabular-nums tracking-[-0.02em]">{number(total)}</p>
          <p className="mt-1 text-sm text-muted">
            {number(usage.inputTokens)} read, {number(usage.outputTokens)} written, in {number(usage.calls)} model calls.
          </p>
          <p className="mt-3 max-w-3xl text-xs text-muted">
            Keel keeps this low by itself, never by cutting what an answer needs: a repeated opening question is answered from memory, work that isn&apos;t needed is skipped, the careful judge is asked only when the first one isn&apos;t sure, and tests and improvements stop as soon as their result is known.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Model calls" icon={<Gauge className="size-4" />} value={number(usage.calls)} note="Replies, tests, improvements and checks" />
          <Stat label="Answered from memory" icon={<Sparkles className="size-4" />} value={number(usage.keptAnswers)} note="Repeated questions, with no model call" />
          <Stat label="Fast-model replies" icon={<Zap className="size-4" />} value={`${fastShare}%`} note={`${number(usage.fastReplies)} of ${number(usage.replies)} replies used Nemotron Lightning`} />
        </div>

        <Panel title="Tokens per day">
          <div className="flex h-40 items-end gap-1 border-b border-line">
            {days.map((d) => (
              <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${d.date}: ${tokenCount(d.tokens)}`}>
                <div className="rounded-t-[3px] bg-brand" style={{ height: `${(d.tokens / max) * 100}%`, minHeight: d.tokens ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-subtle">
            <span>{new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <span>{new Date(new Date(end).getTime() - 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          </div>
        </Panel>

        <Panel title="Keel's agents" padded={false}>
          {crew.length ? (
            <ul className="divide-y divide-line">
              {crew.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{m.name}</span> <span className="text-xs text-muted">· {m.team} · {m.model}</span>
                    <span className="mt-0.5 block text-xs text-muted">{m.does}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{tokenCount(byMember.get(m.id)!.tokens)}</span>
                    <span className="block text-xs text-muted">{calls(byMember.get(m.id)!.calls)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted">Nothing used yet this month.</p>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="By your agents" padded={false}>
            {usage.byAgent.length ? (
              <ul className="divide-y divide-line">
                {usage.byAgent.map((a) => {
                  const agent = a.agentId ? agents.get(a.agentId) : undefined;
                  return (
                    <li key={a.agentId ?? "none"} className="flex items-center gap-3 px-4 py-3 text-sm">
                      {agent ? (
                        <Link href={`/app/agents/${agent.id}`} className="flex-1 font-medium hover:underline">
                          {agent.name}
                        </Link>
                      ) : (
                        <span className="flex-1 text-muted">{a.name}</span>
                      )}
                      <span className="text-right font-semibold tabular-nums">{tokenCount(a.tokens)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted">Nothing used yet this month.</p>
            )}
          </Panel>
          <Panel title="By kind of work" padded={false}>
            {usage.byKind.length ? (
              <ul className="divide-y divide-line">
                {usage.byKind.map((k) => (
                  <li key={k.kind} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="flex-1">{KIND[k.kind] ?? k.kind}</span>
                    <span className="text-xs text-muted">{calls(k.calls)}</span>
                    <span className="text-right font-semibold tabular-nums">{tokenCount(k.tokens)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted">Nothing used yet this month.</p>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
