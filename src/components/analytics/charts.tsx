// Small charts for the analytics pages, drawn on the server as SVG and plain boxes.

const day = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function Axis({ dates }: { dates: string[] }) {
  const every = Math.max(1, Math.ceil(dates.length / 6));
  return (
    <div className="mt-2 flex justify-between text-[11px] text-subtle">
      {dates.filter((_, i) => i % every === 0 || i === dates.length - 1).map((d) => (
        <span key={d}>{day(d)}</span>
      ))}
    </div>
  );
}

/** This period's line against the previous period's (dashed), one point a day. */
export function TrendChart({ days, label = "Conversations" }: { days: { date: string; value: number; previous: number }[]; label?: string }) {
  const W = 800;
  const H = 200;
  const max = Math.max(1, ...days.flatMap((d) => [d.value, d.previous]));
  const x = (i: number) => (days.length <= 1 ? W / 2 : (i / (days.length - 1)) * W);
  const y = (v: number) => H - (v / max) * (H - 12) - 4;
  const line = (key: "value" | "previous") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
  const area = `${line("value")} L${x(days.length - 1)},${H} L${x(0)},${H} Z`;
  return (
    <div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
          {[max, Math.round(max / 2), 0].map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-[11px] tabular-nums text-subtle">{t}</span>
              <span className="flex-1 border-t border-dashed border-line" />
            </div>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ml-8 h-52 w-[calc(100%-2rem)] overflow-visible" role="img" aria-label={`${label} per day`}>
          <path d={area} fill="var(--brand)" opacity="0.08" />
          <path d={line("previous")} fill="none" stroke="var(--subtle)" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <path d={line("value")} fill="none" stroke="var(--brand)" strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="ml-8">
        <Axis dates={days.map((d) => d.date)} />
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-brand" /> This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-subtle" /> Period before
        </span>
      </div>
    </div>
  );
}

export const SENTIMENT_COLOR = { positive: "#12b76a", neutral: "#98a2b3", negative: "#f04438" } as const;

/** Read conversations a day, split by how the customer felt. */
export function SentimentBars({ days }: { days: { date: string; positive: number; neutral: number; negative: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.positive + d.neutral + d.negative));
  return (
    <div>
      <div className="relative flex h-48 items-end gap-1 border-b border-line">
        {days.map((d) => {
          const total = d.positive + d.neutral + d.negative;
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col justify-end" title={`${day(d.date)}: ${d.positive} positive, ${d.neutral} neutral, ${d.negative} negative`}>
              <div className="flex flex-col overflow-hidden rounded-t-[3px]" style={{ height: `${(total / max) * 100}%` }}>
                {(["negative", "neutral", "positive"] as const).map((s) => (
                  <div key={s} style={{ flex: d[s], background: SENTIMENT_COLOR[s] }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Axis dates={days.map((d) => d.date)} />
      <div className="mt-3 flex gap-4 text-xs text-muted">
        {(["positive", "neutral", "negative"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 capitalize">
            <span className="size-2.5 rounded-sm" style={{ background: SENTIMENT_COLOR[s] }} /> {s}
          </span>
        ))}
      </div>
    </div>
  );
}
