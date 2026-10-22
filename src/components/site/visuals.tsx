"use client";

// The pictures on Keel's feature, use-case and industry pages: screens from Keel itself (dashboard pages and the chat a
// business's customers see), each playing as a short loop while it's on screen. Built from the product's own parts
// (app-ui.tsx, src/components/ui.tsx, the chat's parts and widgets, the analytics charts) for an imaginary business,
// Harbor Goods. Nothing here sends anything; the numbers are examples of what each screen shows.

import { BadgeCheck, ChartColumn, Check, House, LifeBuoy, ListChecks, MessageSquareText, Scale, ShieldAlert, Sparkles, Square, TestTubes, Wand2, Zap } from "lucide-react";
import { SentimentBars, TrendChart } from "../analytics/charts";
import { ChatWidget } from "../chat/ChatWidget";
import { SuggestionChips } from "../chat/parts";
import { Backdrop, DraftVisual, LayoutMenuVisual } from "../landing/visuals";
import { Notice, Pill, Spinner, Stat, Toggle } from "../ui";
import { Agent, Answer, AppWindow, ChatWindowShell, Customer, From, Progress, Result, Writing } from "./app-ui";
import { Count, Cursor, Reveal, useLoop } from "./motion";

export type SiteVisual = "setup" | "draft" | "actions" | "procedure" | "testRun" | "quality" | "scan" | "layout" | "inbox" | "analytics" | "improve" | "copilot";

export function FeatureVisual({ kind }: { kind: SiteVisual }) {
  switch (kind) {
    case "setup":
      return <SetupVisual />;
    case "draft":
      return <DraftVisual />;
    case "layout":
      return <LayoutMenuVisual />;
    case "actions":
      return <ActionsVisual />;
    case "procedure":
      return <ProcedureVisual />;
    case "testRun":
      return <TestsVisual />;
    case "quality":
      return <QualityVisual />;
    case "scan":
      return <ScanVisual />;
    case "inbox":
      return <InboxVisual />;
    case "analytics":
      return <AnalyticsVisual />;
    case "improve":
      return <ImproveVisual />;
    case "copilot":
      return <CopilotVisual />;
  }
}

const noop = () => undefined;

/** A screen on the backdrop, the way every picture sits on the page. */
function Stage({ children, tone = "cool", className = "" }: { children: React.ReactNode; tone?: "warm" | "cool"; className?: string }) {
  return (
    <Backdrop tone={tone} className={`p-4 sm:p-6 ${className}`}>
      {children}
    </Backdrop>
  );
}

// ── Example conversations (use cases) ──────────────────────────────────────────────────────────────────────────────

export interface ExampleTurn {
  from: "customer" | "agent";
  text: string;
  /** The source the answer cites. */
  source?: string;
  /** A form the agent shows, by field label. */
  form?: string[];
  /** An order tracker: its steps, and the current one. */
  tracker?: string[];
  trackerAt?: number;
}

/** The time each step of a conversation takes: the agent writes first, then answers. */
const turnSteps = (turns: ExampleTurn[]) => [400, ...turns.flatMap((t) => (t.from === "agent" ? [900, 1500] : [1100])), 2800, 600];

/** A made-up conversation in the real chat window, playing turn by turn. */
export function ExampleChat({ business, turns }: { business: string; turns: ExampleTurn[] }) {
  const steps = turnSteps(turns);
  const { ref, step } = useLoop(steps, steps.length - 2);
  // The step each turn starts on; an agent turn shows "writing" on its first step.
  const starts = turns.reduce<number[]>((acc, t, i) => [...acc, i === 0 ? 1 : acc[i - 1] + (turns[i - 1].from === "agent" ? 2 : 1)], []);
  const shown = step < steps.length - 1;
  return (
    <div ref={ref} className="mx-auto w-full max-w-[520px] font-sans">
      <Backdrop className="px-5 pt-7 sm:px-9">
        <ChatWindowShell name={business} className="h-[480px] rounded-b-none">
          <Agent>Hi! Welcome to {business}. How can I help?</Agent>
          {turns.map((t, i) => {
            const start = starts[i];
            if (t.from === "customer")
              return (
                <Reveal key={i} on={shown && step >= start} from="right">
                  <Customer>{t.text}</Customer>
                </Reveal>
              );
            if (shown && step === start) return <Writing key={i} />;
            return (
              <Reveal key={i} on={shown && step > start} className="space-y-1.5">
                {t.source ? <Answer text={`${t.text} [1]`} /> : <Agent>{t.text}</Agent>}
                {t.source && <From title={t.source} />}
                {t.tracker && (
                  <div className="max-w-[88%]">
                    <ChatWidget widget={{ type: "tracker", title: "Order HG-1043", steps: t.tracker, current: t.trackerAt ?? 0 }} agentId="" onSend={noop} />
                  </div>
                )}
                {t.form && <ChatForm title="Book a demo" fields={t.form} />}
              </Reveal>
            );
          })}
        </ChatWindowShell>
      </Backdrop>
    </div>
  );
}

/** A form in the chat, drawn the way the chat draws its forms (nothing to send here). */
function ChatForm({ title, fields }: { title: string; fields: string[] }) {
  return (
    <div className="max-w-[88%] space-y-2 rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] p-3">
      <p className="text-sm font-semibold">{title}</p>
      {fields.map((f) => (
        <label key={f} className="block text-xs">
          <span className="mb-1 block text-[var(--c-muted)]">{f}</span>
          <span className="block h-7 rounded-lg border border-[var(--c-line)] bg-[var(--c-input-bg)]" />
        </label>
      ))}
      <span className="block w-full rounded-lg bg-[var(--c-accent)] py-1.5 text-center text-sm font-medium text-[var(--c-accent-ink)]">Send</span>
    </div>
  );
}

// ── Industries ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** "{name}" in an industry's starting text, shown as the business's name to come. */
export function WithName({ text }: { text: string }) {
  const parts = text.split("{name}");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="rounded bg-[#eef2fd] px-1 text-[#2348d8]">your business</span>}
        </span>
      ))}
    </>
  );
}

// reset · greeting · questions · tap one · asked · writing · hold · fade
const STARTER_STEPS = [400, 800, 1200, 900, 700, 1300, 1600, 600] as const;

/** How a new agent's chat opens for an industry: its greeting and the questions offered; a visitor taps one. */
export function StarterVisual({ welcome, suggestions }: { welcome: string; suggestions: string[] }) {
  const { ref, step } = useLoop(STARTER_STEPS, 2);
  const on = (from: number) => step < 7 && step >= from;
  return (
    <div ref={ref} className="mx-auto w-full max-w-[520px] font-sans">
      <Backdrop tone="cool" className="px-5 pt-7 sm:px-9">
        <ChatWindowShell name="Your business" className="h-[420px] rounded-b-none">
          <Reveal on={on(1)}>
            <Agent>
              <WithName text={welcome} />
            </Agent>
          </Reveal>
          {on(4) ? (
            <>
              <Customer>{suggestions[0]}</Customer>
              {on(5) && <Writing />}
            </>
          ) : (
            <Reveal on={on(2)} className="relative">
              <SuggestionChips suggestions={suggestions} />
              <Cursor x="62%" y={on(3) ? "10px" : "70px"} show={on(2)} pressing={step === 3} />
            </Reveal>
          )}
        </ChatWindowShell>
      </Backdrop>
    </div>
  );
}

// ── Feature pictures ───────────────────────────────────────────────────────────────────────────────────────────────

/** The goals a shop chooses, from the product's own list (src/core/goals.ts), and the ones the picture turns on. */
const SETUP_GOALS = [
  { title: "Let customers reach a person", on: true },
  { title: "Handle returns and refunds", on: true },
  { title: "Suggest what to ask next", on: true },
  { title: "Collect leads", on: false },
  { title: "Take booking requests", on: false },
];
// reset · three goals on, one by one · the to-do list · press the fix · fixed · hold · fade
const SETUP_STEPS = [400, 800, 800, 800, 1100, 900, 1700, 2200, 600] as const;

/** Guided setup: the owner turns goals on, then Home's to-do list fixes what's left in one click. */
function SetupVisual() {
  const { ref, step } = useLoop(SETUP_STEPS, 7);
  const on = (from: number) => step < 8 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[500px]">
        <AppWindow icon={<House className="size-4" />} title="Home" bodyClassName="space-y-4 p-4">
          <div>
            <p className="text-[13px] font-semibold">What should your assistant do?</p>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-panel">
              {SETUP_GOALS.map((g, i) => (
                <li key={g.title} className={`flex items-center gap-3 px-3 py-2 transition-colors duration-500 ${g.on && step === i + 1 ? "bg-brand-tint/60" : ""}`}>
                  <span className="flex-1 text-[12.5px]">{g.title}</span>
                  <Toggle checked={g.on && on(i + 1)} onChange={noop} label={g.title} />
                </li>
              ))}
            </ul>
          </div>
          <Reveal on={on(4)}>
            <p className="text-[13px] font-semibold">Things to do</p>
            <ul className="relative mt-2 divide-y divide-line rounded-lg border border-line bg-panel">
              {on(6) ? (
                <li className="flex items-center gap-2.5 px-3 py-2.5 text-[12.5px]">
                  <Check className="size-4 text-good" /> Spam protection is on
                </li>
              ) : (
                <li className="flex items-center gap-2.5 px-3 py-2.5">
                  <ShieldAlert className="size-4 shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium">Spam protection is off</span>
                    <span className="block text-[11px] text-muted">It pauses chats that are adverts or abuse.</span>
                  </span>
                  <span className={`btn btn-primary shrink-0 px-2.5 py-1 text-[11px] transition-transform ${step === 5 ? "scale-95" : ""}`}>Turn it on</span>
                  <Cursor x="84%" y={on(5) ? "14px" : "60px"} show={on(4)} pressing={step === 5} />
                </li>
              )}
              <li className="flex items-center gap-2.5 px-3 py-2.5">
                <TestTubes className="size-4 shrink-0 text-warn" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">It hasn&apos;t been tested</span>
                  <span className="block text-[11px] text-muted">AI customers ask it what your customers ask.</span>
                </span>
                <span className="btn btn-secondary shrink-0 px-2.5 py-1 text-[11px]">Write and run tests</span>
              </li>
            </ul>
          </Reveal>
        </AppWindow>
      </Stage>
    </div>
  );
}

const ACTIONS = [
  { title: "Call your API", name: "order_status" },
  { title: "Create a ticket", name: "create_ticket" },
  { title: "Collect leads", name: "collect_lead" },
];
// reset · switch on · question · writing · answer with the tracker · hold · fade
const ACTIONS_STEPS = [500, 900, 900, 1100, 1500, 2600, 600] as const;

/** Actions: the Actions page switches one on, and the chat uses it to answer with an order tracker. */
function ActionsVisual() {
  const { ref, step } = useLoop(ACTIONS_STEPS, 5);
  const on = (from: number) => step < 6 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Backdrop className="h-[520px]">
        <div className="absolute inset-x-5 bottom-0 top-7 sm:left-auto sm:right-4 sm:w-[272px]">
          <ChatWindowShell className="h-full rounded-b-none">
            <Reveal on={on(2)} from="right">
              <Customer>Where&apos;s my order?</Customer>
            </Reveal>
            {step === 3 ? (
              <Writing />
            ) : (
              <Reveal on={on(4)} className="space-y-2">
                <Agent>Order HG-1043 shipped yesterday and should arrive on Thursday.</Agent>
                <div className="max-w-[92%]">
                  <ChatWidget widget={{ type: "tracker", title: "Order HG-1043", steps: ["Ordered", "Packed", "Shipped", "Delivered"], current: 2 }} agentId="" onSend={noop} />
                </div>
              </Reveal>
            )}
          </ChatWindowShell>
        </div>
      </Backdrop>
      <div className="card absolute left-4 top-10 hidden w-[222px] overflow-hidden shadow-raised sm:block lg:hidden xl:block">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 text-sm font-semibold">
          <Zap className="size-4 text-brand" /> Actions
        </div>
        <ul className="divide-y divide-line">
          {ACTIONS.map((a, i) => (
            <li key={a.name} className={`flex items-center gap-2 px-3 py-2.5 transition-colors duration-500 ${i === 0 && on(1) && !on(4) ? "bg-brand-tint/60" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{a.title}</span>
                <span className="block font-mono text-[10.5px] text-muted">@{a.name}</span>
              </span>
              <Toggle checked={i > 0 || on(1)} onChange={noop} label={a.title} />
            </li>
          ))}
        </ul>
        <Reveal on={on(4)} className="border-t border-line px-3 py-2 text-[11px] text-muted">
          Used <span className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10.5px]">@order_status</span> just now
        </Reveal>
      </div>
    </div>
  );
}

const PROCEDURE_LINES: { text: string; depth: number; action?: string; branch?: boolean }[] = [
  { text: "Ask for the order number.", depth: 0, action: "collect_details" },
  { text: "Look the order up.", depth: 0, action: "order_status" },
  { text: "If it was delivered more than 30 days ago:", depth: 0, branch: true },
  { text: "Explain the 30-day window, and offer the team.", depth: 1, action: "create_ticket" },
  { text: "Otherwise:", depth: 0, branch: true },
  { text: "Show the return form.", depth: 1, action: "return_request" },
];
/** Each line's number in the editor ("1.", "2.", … for top-level lines). */
const PROCEDURE_NUMBERS = PROCEDURE_LINES.map((l, i) => (l.depth ? "" : `${PROCEDURE_LINES.slice(0, i + 1).filter((x) => !x.depth).length}.`));
// reset · six lines written · then followed for a customer: 1, 2, 5, 6 · hold · fade
const PROCEDURE_STEPS = [400, 500, 500, 500, 500, 500, 500, 900, 900, 900, 900, 1800, 500] as const;
const FOLLOWED = [0, 1, 4, 5];

/** Procedures: the editor as the steps are written, then the agent following them for one customer. */
function ProcedureVisual() {
  const { ref, step } = useLoop(PROCEDURE_STEPS, 11);
  const on = (from: number) => step < 12 && step >= from;
  const following = step >= 7 && step <= 10 ? FOLLOWED[step - 7] : -1;
  return (
    <div ref={ref} className="mx-auto w-full max-w-[580px] font-sans">
      <Stage>
        <AppWindow
          icon={<ListChecks className="size-4" />}
          title="Procedures"
          actions={
            on(7) ? (
              <Pill tone="brand">
                <Spinner className="size-3" /> Following for a customer
              </Pill>
            ) : (
              <span className="btn btn-primary px-2.5 py-1 text-xs">Save</span>
            )
          }
          bodyClassName="space-y-3 p-4"
        >
          <div>
            <p className="label text-[13px]">Name</p>
            <div className="field py-1.5 text-[13px]">Return request</div>
          </div>
          <div>
            <p className="label text-[13px]">When it applies</p>
            <div className="field py-1.5 text-[13px]">The customer wants to return or exchange something.</div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="label mb-0 text-[13px]">Steps</span>
              <span className="flex flex-wrap justify-end gap-1">
                {["collect_details", "order_status", "create_ticket"].map((a) => (
                  <span key={a} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px]">
                    @{a}
                  </span>
                ))}
              </span>
            </div>
            <div className="field min-h-[150px] space-y-1 py-2 font-mono text-[11.5px] leading-relaxed">
              {PROCEDURE_LINES.map((l, i) => (
                <Reveal key={i} on={on(i + 1)} from="left" className={`flex gap-2 rounded pr-1 transition-colors duration-300 ${following === i ? "bg-brand-tint text-brand" : ""}`} style={{ paddingLeft: l.depth ? 28 : 4 }}>
                  <span className="w-4 shrink-0 text-subtle">{PROCEDURE_NUMBERS[i]}</span>
                  <span className={l.branch ? "font-semibold" : ""}>
                    {l.text} {l.action && <span className="text-brand">@{l.action}</span>}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </AppWindow>
      </Stage>
    </div>
  );
}

const TEST_CASES = [
  { name: "Refund after 40 days", ok: true, score: 96 },
  { name: "Change a delivery address", ok: true, score: 100 },
  { name: "Late parcel, upset", ok: true, score: 88 },
  { name: "Are returns free?", ok: false, score: 30 },
];
// reset · press Run all · waiting · four results · the failed run opens · hold · fade
const TESTS_STEPS = [500, 700, 700, 700, 700, 700, 700, 1300, 2800, 600] as const;

/** Tests: Run all, the results arrive, and the failed run opens with the judge's reasons and the fix button. */
function TestsVisual() {
  const { ref, step } = useLoop(TESTS_STEPS, 8);
  const on = (from: number) => step < 9 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[470px]">
        <div className="relative">
          <AppWindow
            icon={<TestTubes className="size-4" />}
            title="Tests"
            actions={
              <span className={`btn btn-primary px-2.5 py-1 text-xs transition-transform ${step === 1 ? "scale-95" : ""}`}>
                {on(1) && !on(7) ? <Spinner className="size-3.5" /> : null} Run all
              </span>
            }
            bodyClassName="p-3"
          >
            <div className="card overflow-hidden">
              <div className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-[11px] text-muted">
                Latest results: <span className="font-semibold text-text">{TEST_CASES.filter((t, i) => t.ok && on(i + 3)).length}</span> of {TEST_CASES.filter((_, i) => on(i + 3)).length} passed
                <Reveal on={on(7)} as="span" className="ml-auto">
                  <span className="btn btn-secondary px-2 py-0.5 text-[11px]">
                    <Wand2 className="size-3" /> Fix the failing test
                  </span>
                </Reveal>
              </div>
              <ul className="divide-y divide-line">
                {TEST_CASES.map((t, i) => (
                  <li key={t.name} className={`flex items-center gap-2 px-3 py-2.5 transition-colors duration-500 ${on(7) && !t.ok ? "bg-bad-tint/60" : ""}`}>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{t.name}</span>
                    <Pill>Generated</Pill>
                    <span className="flex w-[96px] justify-end">{on(i + 3) ? <Result state={t.ok ? "passed" : "failed"} score={t.score} /> : on(2) ? <Result state="running" /> : on(1) ? <Result state="waiting" /> : <span className="text-xs text-subtle">Not run yet</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          </AppWindow>
          <Cursor x="86%" y={on(1) ? "14px" : "70px"} show={step <= 2} pressing={step === 1} />
        </div>
        <Reveal on={on(7)} className="absolute inset-x-5 bottom-5 sm:left-auto sm:right-6 sm:w-[310px]">
          <div className="card space-y-2 p-3.5 shadow-raised">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Are returns free?</span>
              <Result state="failed" score={30} />
            </div>
            <p className="text-xs text-muted">The judge&apos;s reasons</p>
            <Notice>Not what the business&apos;s information says: &ldquo;Returns are always free.&rdquo; The returns page says customers pay postage on orders under $50.</Notice>
          </div>
        </Reveal>
      </Stage>
    </div>
  );
}

// reset · press · four stages · report · answer opens · hold · fade
const QUALITY_STEPS = [500, 900, 900, 900, 900, 1400, 1200, 2400, 600] as const;
const QUALITY_STAGES = ["Writing the questions", "Asking the agent", "Grading the answers blind", "Checking the tests and the judges"];

/** Quality: Check quality runs through its stages, and the report arrives: grades, tests, judges, an answer. */
function QualityVisual() {
  const { ref, step, loops } = useLoop(QUALITY_STEPS, 7);
  const on = (from: number) => step < 8 && step >= from;
  const running = on(1) && !on(5);
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[480px]">
        <AppWindow
          icon={<BadgeCheck className="size-4" />}
          title="Quality"
          actions={
            <span className="btn btn-primary px-2.5 py-1 text-xs">
              {running ? <Spinner className="size-3.5" /> : <BadgeCheck className="size-3.5" />} Check quality
            </span>
          }
          bodyClassName="space-y-3 p-3"
        >
          {running && (
            <div className="card flex items-center gap-3 p-4 text-sm">
              <Spinner />
              <span className="font-medium">{QUALITY_STAGES[Math.min(QUALITY_STAGES.length - 1, step - 1)]}…</span>
            </div>
          )}
          <Reveal on={on(5)} className="grid grid-cols-3 gap-2 [&_.card]:p-3 [&_p.mt-2]:text-[20px]">
            <Stat label="Answers" icon={<MessageSquareText className="size-3.5" />} value={on(5) ? <><Count key={loops} to={9.3} decimals={1} ms={1100} /> / 10</> : "–"} note="Best: 9.4" />
            <Stat label="Tests" icon={<TestTubes className="size-3.5" />} value={on(5) ? <><Count key={`t${loops}`} to={8} ms={900} /> of 8</> : "–"} note="match what it knows" />
            <Stat label="Judges" icon={<Scale className="size-3.5" />} value={on(5) ? <><Count key={`j${loops}`} to={3} ms={700} /> of 3</> : "–"} note="mistakes caught" />
          </Reveal>
          <Reveal on={on(6)} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 px-3 py-2.5 text-[13px]">
              <Pill tone="good">9 / 10</Pill>
              <span className="min-w-0 flex-1 truncate font-medium">How long do I have to return shoes, and is it free?</span>
              <span className="hidden text-[11px] text-muted sm:inline">Several at once</span>
            </div>
            <div className="space-y-2 px-3 pb-3 text-[12px]">
              <p className="rounded-lg border border-line p-2.5">You have 30 days from delivery to return unworn shoes. Returns are free in the UK with the prepaid label from your order email.</p>
              <p>
                <span className="font-medium">Grade:</span> Both parts answered with the right window and cost.
              </p>
            </div>
          </Reveal>
        </AppWindow>
      </Stage>
    </div>
  );
}

const SCAN_ROWS = [
  { label: "Instructions encoded in Base64", tried: 3, through: 0 },
  { label: "Jailbreak prompts seen in the wild", tried: 3, through: 0 },
  { label: "Data smuggled out in a markdown image", tried: 12, through: 0 },
  { label: "SQL injection repeated back", tried: 10, through: 1 },
];
// reset · attacking (four kinds arrive) · checking flagged · result · press fix · fixing · hold · fade
const SCAN_STEPS = [500, 800, 800, 800, 800, 900, 1500, 700, 1600, 2000, 600] as const;

/** Security: NVIDIA garak attacks the agent, the result arrives, and Fix what got through starts Improve. */
function ScanVisual() {
  const { ref, step, loops } = useLoop(SCAN_STEPS, 6);
  const on = (from: number) => step < 10 && step >= from;
  const attacking = on(1) && !on(5);
  const done = on(6);
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[490px]">
        <AppWindow icon={<TestTubes className="size-4" />} title="Tests" bodyClassName="p-0">
          <div className="flex gap-5 border-b border-line bg-panel px-4 text-[13px]">
            <span className="py-2 text-muted">AI customers</span>
            <span className="-mb-px border-b-2 border-ink py-2 font-medium">Security scan</span>
          </div>
          <div className="p-3">
            <div className="card p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted">Quick scan · just now · {attacking ? <Count key={loops} to={69} ms={3200} /> : on(5) ? 69 : 0} attacks answered</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[14px] font-semibold">
                    {!done && on(1) && <Spinner />}
                    {done ? "1 of 69 attacks got through" : on(5) ? "Checking the 10 attacks garak flagged" : on(1) ? "NVIDIA garak is attacking the agent" : "Starting NVIDIA garak"}
                  </p>
                  {done && <p className="mt-0.5 text-[11px] text-muted">garak flagged 9 more that the agent actually refused, checked by Nemotron 3 Super: they aren&apos;t counted.</p>}
                </div>
                {done && <Pill tone="good">NeMo Guardrails stopped 23</Pill>}
                {!done && on(1) && (
                  <span className="btn btn-secondary px-2 py-1 text-xs">
                    <Square className="size-3 fill-current" /> Stop
                  </span>
                )}
              </div>
              <table className="mt-3 w-full text-left text-[12px]">
                <thead className="border-b border-line text-[11px] text-muted">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Kind of attack</th>
                    <th className="py-1.5 pr-2 font-medium">Tried</th>
                    <th className="py-1.5 font-medium">Got through</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {SCAN_ROWS.map((r, i) => (
                    <tr key={r.label} className={`transition-opacity duration-500 ${on(i + 1) ? "opacity-100" : "opacity-0"}`}>
                      <td className="py-1.5 pr-2 font-medium">{r.label}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{r.tried}</td>
                      <td className={`py-1.5 tabular-nums ${done && r.through ? "font-semibold text-bad" : "text-good"}`}>
                        {done && r.through ? (
                          <span className="inline-flex items-center gap-1">
                            <ShieldAlert className="size-3.5" /> {r.through}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Reveal on={done} className="relative mt-3 flex items-center gap-3 rounded-xl border border-line bg-panel-2/40 p-2.5">
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted">Each attack that got through becomes a security test, sent word for word. Improve then looks for a rule that stops it.</p>
                <span className={`btn btn-primary shrink-0 px-2.5 py-1.5 text-xs transition-transform ${step === 7 ? "scale-95" : ""}`}>
                  {on(8) ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />} {on(8) ? "Starting Improve" : "Fix what got through"}
                </span>
                <Cursor x="82%" y={on(7) ? "14px" : "56px"} show={on(6) && !on(9)} pressing={step === 7} />
              </Reveal>
              <Reveal on={on(9)} className="mt-2">
                <Notice tone="brand">
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="size-3.5" /> Improve: measuring the agent on the new security test
                  </span>
                </Notice>
              </Reveal>
            </div>
          </div>
        </AppWindow>
      </Stage>
    </div>
  );
}

const IMPROVE_STAGES = ["Measuring the agent as it is: 10 tests, 3 runs each", "Round 1: finding why 6 tests fail", "Round 1: trying fix 1 of 2 on a copy", "Confirming the best fix on fresh runs"];
// reset · four stages · result · edit · press apply · applied · hold · fade
const IMPROVE_STEPS = [500, 1300, 1200, 1300, 1200, 1500, 1000, 800, 1000, 2000, 600] as const;

/** Improve: a session works through its stages, finds a proven fix, and it's applied. */
function ImproveVisual() {
  const { ref, step, loops } = useLoop(IMPROVE_STEPS, 9);
  const on = (from: number) => step < 10 && step >= from;
  const running = on(1) && !on(5);
  const applied = on(8);
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage tone="warm" className="h-[490px]">
        <AppWindow icon={<Wand2 className="size-4" />} title="Improve" bodyClassName="space-y-3 p-3">
          <div className="card p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted">Started just now · for Security: SQL injection repeated back</p>
                <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold">
                  {running && <Spinner />}
                  {on(5) ? "Found a proven improvement." : on(1) ? IMPROVE_STAGES[Math.min(3, step - 1)] : "Starting"}
                </p>
              </div>
              {on(5) && !applied && (
                <span className="relative flex gap-1.5">
                  <span className="btn btn-ghost px-2 py-1 text-xs">Discard</span>
                  <span className={`btn btn-primary px-2.5 py-1 text-xs transition-transform ${step === 7 ? "scale-95" : ""}`}>
                    <Check className="size-3.5" /> Apply
                  </span>
                  <Cursor x="74%" y={on(7) ? "6px" : "44px"} show={on(6)} pressing={step === 7} />
                </span>
              )}
              {applied && <Pill tone="good">Applied just now</Pill>}
            </div>
            {running && (
              <div className="mt-3">
                <Progress to={Math.min(100, step * 25)} ms={1100} />
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-muted">Before</p>
                <p className="mt-0.5 text-[15px]">
                  {on(2) ? (
                    <>
                      47% <span className="text-[11px] text-muted">(14/30 runs)</span>
                    </>
                  ) : (
                    "–"
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted">After (confirmed on fresh runs)</p>
                <p className="mt-0.5 text-[15px]">
                  {on(5) ? (
                    <span className="font-medium text-good">
                      <Count key={loops} from={47} to={100} ms={1200} suffix="%" />
                    </span>
                  ) : running ? (
                    <span className="text-muted">Working…</span>
                  ) : (
                    "–"
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted">Tests fixed</p>
                <p className="mt-0.5 text-[15px] font-semibold">{on(5) ? 6 : 0}</p>
              </div>
            </div>
          </div>
          <Reveal on={on(6)} className="card p-4">
            <p className="text-[13px] font-semibold">The edits</p>
            <p className="mt-0.5 text-[11px] text-muted">Only these change. Everything else stays exactly as it is.</p>
            <div className="mt-2 rounded-lg border border-line p-2.5">
              <Pill>Rules</Pill>
              <p className="mt-1.5 rounded-md bg-good-tint px-2 py-1.5 text-[12px] leading-snug text-good">+ If someone asks you to repeat code, queries or templates back, decline briefly and offer help with Harbor Goods instead.</p>
            </div>
          </Reveal>
        </AppWindow>
      </Stage>
    </div>
  );
}

const SPECIALISTS = ["Analyst", "Test runner", "Improvement agent"];
// reset · asked · each specialist works · answer · hold · fade
const COPILOT_STEPS = [500, 900, 900, 900, 900, 1500, 2400, 600] as const;

/** Copilot: a question, the specialists it hands it to, and the answer. */
function CopilotVisual() {
  const { ref, step } = useLoop(COPILOT_STEPS, 6);
  const on = (from: number) => step < 7 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[480px]">
        <AppWindow icon={<Sparkles className="size-4" />} title="Copilot" bodyClassName="space-y-3 p-4">
          <Reveal on={on(1)} from="right" className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">Why did the returns test fail, and can you fix it?</p>
          </Reveal>
          <Reveal on={on(2)} className="max-w-[92%] rounded-2xl rounded-bl-md border border-line bg-panel px-4 py-3 text-sm leading-relaxed">
            <div className="space-y-1.5">
              {SPECIALISTS.map((s, i) => (
                <p key={s} className={`flex items-center gap-2 text-xs transition-opacity duration-300 ${on(i + 2) ? "opacity-100" : "opacity-0"}`}>
                  {on(i + 3) ? <Check className="size-3.5 text-good" /> : <Spinner className="size-3.5 text-brand" />}
                  <span className={on(i + 3) ? "text-muted" : "font-medium"}>{on(i + 3) ? `${s}: done` : `Asking the ${s.toLowerCase()}…`}</span>
                </p>
              ))}
            </div>
            <Reveal on={on(5)} className="mt-3 border-t border-line pt-3">
              The agent said returns are always free, but your returns page says customers pay postage on orders under $50. The improvement agent found a fix and proved it on fresh runs: it&apos;s waiting for you in Improve.
            </Reveal>
          </Reveal>
          <Reveal on={on(5)} className="flex flex-wrap gap-1.5">
            {["Show me the fix", "Run all the tests", "What do customers ask most?"].map((p) => (
              <span key={p} className="rounded-full border border-line bg-panel px-3 py-1 text-xs">
                {p}
              </span>
            ))}
          </Reveal>
        </AppWindow>
      </Stage>
    </div>
  );
}

const TICKETS = [
  { subject: "Gift return, no receipt", status: "Open", tone: "brand" as const, time: "just now" },
  { subject: "Parcel two days late", status: "Waiting", tone: "warn" as const, time: "1 h ago" },
  { subject: "Change of address", status: "Closed", tone: "neutral" as const, time: "3 h ago" },
];
// reset · ticket arrives · summary · drafting · draft · press send · sent · hold · fade
const INBOX_STEPS = [500, 900, 900, 1000, 1200, 800, 1300, 1800, 600] as const;

/** Helpdesk: a ticket arrives with the agent's summary, a reply is drafted, and it's sent to the customer's chat. */
function InboxVisual() {
  const { ref, step } = useLoop(INBOX_STEPS, 7);
  const on = (from: number) => step < 8 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage tone="warm" className="h-[480px]">
        <AppWindow icon={<LifeBuoy className="size-4" />} title="Helpdesk inbox" bodyClassName="grid h-[390px] grid-cols-[160px_1fr] p-0 sm:grid-cols-[180px_1fr]">
          <ul className="divide-y divide-line border-r border-line bg-panel">
            {TICKETS.map((t, i) => {
              const fresh = i === 0;
              return (
                <Reveal key={t.subject} on={!fresh || on(1)} from="left" className={`px-3 py-2.5 ${fresh && on(1) ? "bg-brand-tint/60" : ""}`}>
                  <div className="flex items-center gap-1.5">
                    <Pill tone={fresh && on(6) ? "warn" : t.tone}>{fresh && on(6) ? "Waiting" : t.status}</Pill>
                    <span className="ml-auto text-[10px] text-subtle">{t.time}</span>
                  </div>
                  <p className="mt-1 truncate text-[12px] font-medium">{t.subject}</p>
                </Reveal>
              );
            })}
          </ul>
          <div className="space-y-2.5 bg-panel p-3 text-[12px]">
            <Reveal on={on(1)}>
              <p className="text-[14px] font-semibold">Gift return, no receipt</p>
              <p className="text-[11px] text-muted">From the chat · opened by the agent</p>
            </Reveal>
            <Reveal on={on(2)} className="rounded-lg bg-panel-2 p-2.5 leading-snug">
              <span className="font-medium">Summary:</span> The customer wants to return a gift without the receipt and asked for a person. The agent explained the 30-day rule for gifts.
            </Reveal>
            {on(6) ? (
              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-white">
                Hi! Happy to help. Send me the order number or the buyer&apos;s email and I&apos;ll set up the return for a gift card.
                <span className="mt-1 block text-[10px] text-white/60">Sent to the customer&apos;s chat</span>
              </div>
            ) : (
              <Reveal on={on(3)}>
                <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
                  {on(4) ? <Sparkles className="size-3 text-brand" /> : <Spinner className="size-3 text-brand" />} {on(4) ? "Drafted reply" : "Drafting a reply…"}
                </p>
                <div className="field min-h-[64px] py-2 text-[12px] leading-snug">
                  <Reveal on={on(4)} as="span">
                    Hi! Happy to help. Send me the order number or the buyer&apos;s email and I&apos;ll set up the return for a gift card.
                  </Reveal>
                </div>
                <div className="relative mt-2 flex justify-end">
                  <span className={`btn btn-primary px-3 py-1 text-xs transition-transform ${step === 5 ? "scale-95" : ""}`}>Send</span>
                  <Cursor x="88%" y={on(5) ? "4px" : "40px"} show={on(4)} pressing={step === 5} />
                </div>
              </Reveal>
            )}
          </div>
        </AppWindow>
      </Stage>
    </div>
  );
}

/** A made-up fortnight of conversations for the chart. */
const PREVIOUS = [28, 30, 33, 31, 36, 35, 39, 37, 40, 42, 41, 45, 44, 47];
/** The fortnight's days, from 20 September 2026. */
const dayOf = (i: number) => new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10);
const TREND = [31, 38, 35, 44, 41, 52, 47, 49, 55, 51, 60, 58, 63, 66].map((value, i) => ({ date: dayOf(i), value, previous: PREVIOUS[i] }));
const SENTIMENT = TREND.slice(-7).map((d, i) => ({ date: d.date, positive: [20, 24, 22, 27, 26, 30, 33][i], neutral: [8, 9, 9, 8, 10, 9, 10][i], negative: [3, 2, 4, 2, 3, 2, 2][i] }));
// reset · numbers · chart draws · sentiment · hold · fade
const ANALYTICS_STEPS = [400, 900, 1700, 1200, 2600, 600] as const;

/** Analytics: the numbers count up, the trend draws, and how customers felt fills in. */
function AnalyticsVisual() {
  const { ref, step, loops } = useLoop(ANALYTICS_STEPS, 4);
  const on = (from: number) => step < 5 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Stage className="h-[570px]">
        <AppWindow icon={<ChartColumn className="size-4" />} title="Analytics" bodyClassName="space-y-3 p-3">
          <div className="grid grid-cols-3 gap-2 [&_.card]:p-3 [&_p.mt-2]:text-[20px]">
            <Stat label="Conversations" value={on(1) ? <Count key={loops} to={690} ms={1200} /> : 0} note="last 14 days" />
            <Stat label="Answered" value={on(1) ? <Count key={`a${loops}`} to={92} ms={1200} suffix="%" /> : "0%"} note="without the team" />
            <Stat label="Handed over" value={on(1) ? <Count key={`h${loops}`} to={4} ms={1200} suffix="%" /> : "0%"} note="to a person" />
          </div>
          <div className="card p-3">
            <p className="mb-1 text-[13px] font-medium">Conversations</p>
            <div className={`[&_svg]:h-[96px] ${on(2) ? "transition-[clip-path] duration-[1600ms] ease-out" : "transition-none"}`} style={{ clipPath: on(2) ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}>
              <TrendChart days={TREND} />
            </div>
          </div>
          <Reveal on={on(3)} className="card p-3">
            <p className="mb-1 text-[13px] font-medium">How customers felt</p>
            <div className="[&_.h-48]:h-[52px]">
              <SentimentBars days={SENTIMENT} />
            </div>
          </Reveal>
        </AppWindow>
      </Stage>
    </div>
  );
}
