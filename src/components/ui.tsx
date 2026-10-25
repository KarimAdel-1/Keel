import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { inkFor } from "@/core/agents";

/** An agent's face: its first letter on its colour. */
export function AgentAvatar({ name, color, size = 36, src }: { name: string; color: string; size?: number; src?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden className="shrink-0 rounded-full bg-white object-contain p-[2px] ring-1 ring-black/10" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{ background: color, color: inkFor(color), width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

const PILL_TONE = {
  good: "bg-good-tint text-good",
  warn: "bg-warn-tint text-warn",
  bad: "bg-bad-tint text-bad",
  neutral: "bg-panel-2 text-muted",
  brand: "bg-brand-tint text-brand",
} as const;

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof PILL_TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${PILL_TONE[tone]}`}>{children}</span>;
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return <LoaderCircle aria-hidden className={`animate-spin ${className}`} />;
}

export function Notice({ tone = "bad", children }: { tone?: "bad" | "warn" | "good" | "brand"; children: ReactNode }) {
  return <div role={tone === "bad" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${PILL_TONE[tone]}`}>{children}</div>;
}

/** A number on the dashboard: what it counts, the number, and a line of context. */
export function Stat({ label, value, note, icon }: { label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between text-sm text-muted">
        {label}
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-[-0.02em] tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** A titled panel on a dashboard page. */
export function Panel({ title, action, children, className = "", padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/** "3 minutes ago", "yesterday", "12 Sep". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 172_800) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** An on/off switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-good" : "bg-panel-3"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

/** What a page shows before there's anything on it: what it's for, and the one thing to do. */
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {icon && <span className="inline-flex size-11 items-center justify-center rounded-full bg-panel-2 text-muted">{icon}</span>}
      <p className="mt-4 font-semibold">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Tabs that are links (each tab its own address). */
export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="-mb-px flex gap-6 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition ${t.key === active ? "border-text text-text" : "border-transparent text-muted hover:text-text"}`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-panel-2 px-1.5 py-px text-[11px] text-muted">{t.count}</span>}
        </a>
      ))}
    </nav>
  );
}

/** "↑ 12%" or "↓ 3" against the previous period. */
export function Change({ now, before }: { now: number; before: number }) {
  if (!before && !now) return <span className="text-xs text-subtle">No change</span>;
  if (!before) return <span className="text-xs text-good">New</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return <span className={`text-xs font-medium ${pct > 0 ? "text-good" : pct < 0 ? "text-bad" : "text-subtle"}`}>{pct > 0 ? "↑" : pct < 0 ? "↓" : ""} {Math.abs(pct)}% vs before</span>;
}
