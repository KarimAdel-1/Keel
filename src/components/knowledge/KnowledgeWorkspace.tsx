"use client";

import { ArrowRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import type { Agent } from "@/core/agents";
import { ChatWindow } from "../chat/ChatWindow";
import { lookOf } from "../chat/look";
import { KnowledgeEditor, type Knowledge } from "./KnowledgeEditor";

/**
 * Adding knowledge with the agent beside it: as soon as one source is ready, the builder can ask a question and see
 * the answer, with where it came from. In setup, a "Continue" button leads to the next step.
 */
export function KnowledgeWorkspace({ agent, initial, continueHref }: { agent: Agent; initial: Knowledge; continueHref?: string }) {
  const [knowledge, setKnowledge] = useState(initial);
  const onChange = useCallback((k: Knowledge) => setKnowledge(k), []);
  const ready = knowledge.sources.filter((s) => s.status === "ready").length;
  const learning = knowledge.sources.some((s) => s.status === "pending" || s.status === "training") || knowledge.reads.some((r) => r.status === "reading");

  const hint = (
    <div className="flex gap-2.5 rounded-xl border border-dashed border-line-strong px-3.5 py-3 text-sm text-muted">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted" />
      <p>
        {ready
          ? "Ask a question your customers often ask. Each answer shows which source it came from: click it to see the passage."
          : learning
            ? "Learning what you added… You can ask a question as soon as a source shows “Ready”."
            : "Add something on the left, then ask a question here to see how it answers."}
      </p>
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-6">
        <KnowledgeEditor agentId={agent.id} agentName={agent.config.appearance.displayName} initial={initial} onChange={onChange} />
        {continueHref && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-5 py-4">
            <p className="text-sm text-muted">
              {ready ? `${agent.config.appearance.displayName} knows ${ready} source${ready === 1 ? "" : "s"}. You can add more at any time.` : "Add at least one source, or skip this and add knowledge later."}
            </p>
            {ready ? (
              <Link href={continueHref} className="btn btn-primary">
                Continue <ArrowRight className="size-4" />
              </Link>
            ) : (
              <Link href={continueHref} className="btn btn-ghost">
                Skip for now
              </Link>
            )}
          </div>
        )}
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <ChatWindow agentId={agent.id} look={lookOf(agent.config.appearance)} endpoint={`/api/agents/${agent.id}/chat`} subtitle="Test chat · only you can see it" emptyHint={hint} className="h-[620px] max-h-[calc(100dvh-6rem)] rounded-2xl" />
      </div>
    </div>
  );
}
