"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SetupStep } from "@/platform/setup";

/** Getting started: the ten steps from a new agent to one that's live, tested and watched. Any step can be skipped. */
export function SetupChecklist({ agentId, steps: initial }: { agentId: string; steps: SetupStep[] }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initial);
  const finished = steps.filter((s) => s.done || s.skipped).length;
  const next = steps.find((s) => !s.done && !s.skipped);

  async function skip(step: SetupStep, skip: boolean) {
    setSteps((all) => all.map((s) => (s.key === step.key ? { ...s, skipped: skip } : s)));
    await fetch(`/api/agents/${agentId}/setup`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: step.key, skip }) });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">
            {finished} of {steps.length} done
          </span>
          {next ? <span className="text-muted">Next: {next.title}</span> : <span className="font-medium text-good">All set</span>}
        </div>
        <div className="mt-3 flex gap-1">
          {steps.map((s) => (
            <span key={s.key} className={`h-1.5 flex-1 rounded-full ${s.done ? "bg-good" : s.skipped ? "bg-panel-3" : "bg-panel-2"}`} />
          ))}
        </div>
      </div>
      <ol className="card divide-y divide-line overflow-hidden">
        {steps.map((s, i) => {
          const current = next?.key === s.key;
          return (
            <li key={s.key} className={`flex items-start gap-4 px-5 py-4 ${current ? "bg-brand-tint/40" : ""}`}>
              <span
                className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? "bg-good text-white" : s.skipped ? "bg-panel-2 text-subtle" : current ? "bg-ink text-white" : "border border-line text-muted"
                }`}
              >
                {s.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${s.skipped && !s.done ? "text-muted line-through" : ""}`}>{s.title}</p>
                <p className="mt-0.5 text-sm text-muted">{s.text}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!s.done && (
                  <button type="button" onClick={() => void skip(s, !s.skipped)} className="btn btn-ghost px-2.5 py-1.5 text-xs">
                    {s.skipped ? "Undo skip" : "Skip"}
                  </button>
                )}
                <Link href={s.href} className={`btn px-3 py-1.5 text-xs ${current ? "btn-primary" : "btn-secondary"}`}>
                  {s.done ? "Review" : s.cta} <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
