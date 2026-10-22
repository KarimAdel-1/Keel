import { Check } from "lucide-react";

const STEPS = ["Your business", "Review", "Add more", "Try it"];

/** Where the builder is in creating an agent: four steps, the current one highlighted. */
export function SetupSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px]" aria-label="Steps">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2.5" aria-current={active ? "step" : undefined}>
            <span className={`flex items-center gap-2 ${active ? "font-semibold text-text" : done ? "text-text" : "text-subtle"}`}>
              <span className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${active ? "bg-ink text-white" : done ? "bg-good text-white" : "bg-panel-3 text-muted"}`}>
                {done ? <Check className="size-3" /> : step}
              </span>
              {label}
            </span>
            {step < STEPS.length && <span className="h-px w-6 bg-line-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
