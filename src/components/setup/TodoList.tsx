"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Todo } from "@/platform/setup";
import { Notice, Spinner } from "../ui";

/** The agent's to-do list: what leaves customers stuck first, each with a one-click fix or where to fix it. */
export function TodoList({ agentId, initial }: { agentId: string; initial: Todo[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  async function fix(todo: Todo) {
    if (!todo.fix) return;
    setBusy(todo.key);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/todos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fix: todo.fix.kind }) }).catch(() => undefined);
    const body = ((await res?.json().catch(() => ({}))) ?? {}) as { todos?: Todo[]; error?: string };
    setBusy(null);
    if (!res?.ok || !body.todos) return setError(body.error ?? "That couldn't be done. Try again in a moment.");
    if (todo.fix.kind === "write_tests") setStarted(true);
    setItems(body.todos);
    router.refresh();
  }

  if (!items.length) {
    return (
      <div className="card flex items-center gap-3 p-5 text-sm">
        <CheckCircle2 className="size-5 text-good" /> Nothing needs fixing. Customers are looked after.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {started && <Notice tone="good">Tests are written and running with AI customers. Results appear in Tests in a few minutes.</Notice>}
      {error && <Notice>{error}</Notice>}
      <ul className="card divide-y divide-line overflow-hidden">
        {items.map((t) => {
          const Icon = t.weight === 3 ? AlertTriangle : Info;
          return (
            <li key={t.key} className="flex items-start gap-3 px-5 py-4">
              <Icon className={`mt-0.5 size-4 shrink-0 ${t.weight === 3 ? "text-bad" : t.weight === 2 ? "text-warn" : "text-subtle"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="mt-0.5 text-sm text-muted">{t.text}</p>
              </div>
              {t.fix ? (
                <button type="button" onClick={() => void fix(t)} disabled={busy !== null} className="btn btn-primary shrink-0 px-3 py-1.5 text-xs">
                  {busy === t.key && <Spinner className="size-3.5" />} {t.fix.label}
                </button>
              ) : t.href ? (
                <Link href={t.href} className="btn btn-secondary shrink-0 px-3 py-1.5 text-xs">
                  {t.cta} <ArrowRight className="size-3.5" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
