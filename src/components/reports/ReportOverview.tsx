import { ArrowRight, CircleCheck, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** A consistent result-first treatment for agent reports, without rewriting their evidence. */
export function ReportOverview({
  title,
  description,
  value,
  total,
  label,
  attention = 0,
  children,
}: {
  title: string;
  description: string;
  value: number;
  total: number;
  label: string;
  attention?: number;
  children?: ReactNode;
}) {
  const percent = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-5 p-6">
        <div
          role="img"
          aria-label={`${value} of ${total} ${label}`}
          className="flex size-24 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(var(--ink) ${percent}%, var(--panel-3) 0)` }}
        >
          <div className="flex size-20 items-center justify-center rounded-full bg-panel text-xl font-semibold tabular-nums">
            {value}
            <span className="ml-0.5 text-sm font-normal text-muted">/{total}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-muted">{label}</p>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
          <p className="mt-3 flex items-center gap-2 text-xs font-medium">
            {attention ? <CircleAlert className="size-4 text-warn" /> : <CircleCheck className="size-4 text-muted" />}
            {attention ? `${attention} ${attention === 1 ? "needs" : "need"} your attention` : "Review the findings below"}
          </p>
        </div>
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel-2/40 px-6 py-3">
          {children}
          <ArrowRight aria-hidden className="ml-auto size-4 text-muted" />
        </div>
      )}
    </section>
  );
}
