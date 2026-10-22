"use client";

import { Check, MessageSquareText } from "lucide-react";
import { useState } from "react";
import type { GoalStatus } from "@/platform/goals";
import { Notice, Spinner, Toggle } from "../ui";

/**
 * "What should your assistant do?": the owner's goals, each one switch. Turning one on sets up the actions and
 * step-by-step guides behind it (they're in Actions and Procedures, to fine-tune later).
 */
export function GoalsPicker({ agentId, initial, compact = false }: { agentId: string; initial: GoalStatus[]; compact?: boolean }) {
  const [goals, setGoals] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(key: GoalStatus["key"], on: boolean) {
    setBusy(key);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/goals`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, on }) }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { goals?: GoalStatus[]; error?: string };
    setBusy(null);
    if (!res?.ok || !body.goals) return setError(body.error ?? "That couldn't be changed. Try again in a moment.");
    setGoals(body.goals);
  }

  return (
    <div className="space-y-2">
      <div className={`flex items-start gap-3 rounded-xl border border-line bg-panel-2/40 ${compact ? "p-3" : "p-4"}`}>
        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-good-tint text-good">
          <Check className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Answer questions from your information</p>
          {!compact && <p className="mt-0.5 text-sm text-muted">Always on: everything you add in What it knows.</p>}
        </div>
        <MessageSquareText className="size-4 text-subtle" />
      </div>
      {goals.map((g) => (
        <div key={g.key} className={`flex items-start gap-3 rounded-xl border ${g.on ? "border-brand/40 bg-brand-tint/30" : "border-line"} ${compact ? "p-3" : "p-4"}`}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{g.title}</p>
            {!compact && <p className="mt-0.5 text-sm text-muted">{g.text}</p>}
          </div>
          {busy === g.key ? <Spinner /> : <Toggle checked={g.on} onChange={(on) => void change(g.key, on)} label={g.title} />}
        </div>
      ))}
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
