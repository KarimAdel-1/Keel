"use client";

// The pictures on the home page: screens from Keel itself (the chat a business's customers see, the Knowledge page,
// the Tests page, an answer's source, the Channels page), each playing as a short loop while it's on screen. Built
// from the product's own parts (src/components/site/app-ui.tsx). Nothing here sends anything.

import { BookOpenText, Check, ChevronsUpDown, FileText, Globe, Radio, Sparkles } from "lucide-react";
import { LAYOUT_INFO, STYLE_INFO, type ChatLayout, type ChatStyle } from "@/core/agents";
import { Pill, Spinner } from "../ui";
import { Agent, Answer, AppWindow, ChatColours, ChatWindowShell, Customer, From, Progress, Result, SourceState, Writing } from "../site/app-ui";
import { Count, Cursor, Reveal, useLoop } from "../site/motion";

/** A soft backdrop that stands in for a photo: a light colour wash. */
export function Backdrop({ tone = "warm", children, className = "" }: { tone?: "warm" | "cool" | "dark"; children?: React.ReactNode; className?: string }) {
  const bg =
    tone === "warm"
      ? "linear-gradient(140deg, #f4ede4 0%, #ece6f6 55%, #e3ebfb 100%)"
      : tone === "cool"
        ? "linear-gradient(150deg, #e8eefc 0%, #f1f4f8 60%, #e9f2ee 100%)"
        : "linear-gradient(150deg, #2a2d33 0%, #1d2026 100%)";
  return (
    <div className={`relative overflow-hidden rounded-[22px] ${className}`} style={{ background: bg }}>
      {children}
    </div>
  );
}

/** Two questions the hero's chat takes turns answering, each with the test that checks it. */
const HERO_TURNS = [
  { ask: "Can I return a gift?", answer: "Yes. A gift can be returned within 30 days of delivery for a gift card of the same value. [1]", source: "Returns and refunds" },
  { ask: "How long does shipping take?", answer: "Standard UK delivery takes 3 to 5 working days, and it's free on orders over £50. [1]", source: "Delivery" },
];
const HERO_TESTS = ["Gift return, no receipt", "Shipping time", "Change an order"];
// reset · read the site · question · writing · answer · tests · hold · fade
const HERO_STEPS = [500, 1900, 900, 1100, 1300, 1900, 2600, 700] as const;

/** The hero: the website being read, a customer's question answered with its source, and the tests that check it. */
export function HeroVisual() {
  const { ref, step, loops } = useLoop(HERO_STEPS, 6);
  const turn = HERO_TURNS[loops % HERO_TURNS.length];
  const on = (from: number) => step < 7 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Backdrop className="h-[470px] sm:h-[500px]">
        <div className="absolute inset-x-5 bottom-0 top-7 sm:left-auto sm:right-4 sm:w-[272px]">
          <ChatWindowShell className="h-full rounded-b-none">
            <Agent>Hi! Welcome to Harbor Goods. How can I help?</Agent>
            <Reveal on={on(2)} from="right">
              <Customer>{turn.ask}</Customer>
            </Reveal>
            {step === 3 ? (
              <Writing />
            ) : (
              <Reveal on={on(4)} className="space-y-1.5">
                <Answer text={turn.answer} />
                <From title={turn.source} />
              </Reveal>
            )}
          </ChatWindowShell>
        </div>
      </Backdrop>

      {/* The Knowledge page, reading the website. */}
      <div className="card absolute left-4 top-12 hidden w-[222px] p-3 shadow-raised sm:block lg:hidden xl:block">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-muted">
            <Globe className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">harbor.example</span>
            <span className="block truncate text-xs text-muted">Website · {on(1) ? <Count key={loops} to={18} ms={1700} /> : 0} pages</span>
          </span>
          <SourceState state={on(2) ? "ready" : on(1) ? "learning" : "waiting"} />
        </div>
        <div className="mt-3">
          <Progress to={on(1) ? 100 : 0} ms={1700} />
        </div>
      </div>

      {/* The Tests page's latest results. */}
      <div className="card absolute left-4 top-[150px] hidden w-[222px] overflow-hidden shadow-raised sm:block lg:hidden xl:block">
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 text-xs text-muted">
          <span className="font-medium text-text">Run results</span>
          <span>{on(5) ? `${HERO_TESTS.length} of ${HERO_TESTS.length} passed` : on(1) ? "Waiting" : ""}</span>
        </div>
        <ul className="divide-y divide-line">
          {HERO_TESTS.map((t, i) => (
            <li key={t} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13px]">
              <span className="truncate font-medium">{t}</span>
              <Delayed on={on(5)} ms={i * 450} before={<Result state={on(1) ? "running" : "waiting"} />}>
                <Result state="passed" />
              </Delayed>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Shows `before`, then its children once `on`, after a delay (a CSS transition, so nothing keeps time). */
function Delayed({ on, ms, before, children }: { on: boolean; ms: number; before: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="relative inline-grid shrink-0 justify-items-end">
      <span className="col-start-1 row-start-1 transition-opacity duration-300" style={{ opacity: on ? 0 : 1, transitionDelay: on ? `${ms}ms` : "0ms" }}>
        {before}
      </span>
      <span className="col-start-1 row-start-1 transition-opacity duration-300" style={{ opacity: on ? 1 : 0, transitionDelay: on ? `${ms}ms` : "0ms" }}>
        {children}
      </span>
    </span>
  );
}

const DRAFT_PAGES = [
  { title: "Shipping and delivery", path: "harbor.example/shipping" },
  { title: "Returns and exchanges", path: "harbor.example/returns" },
  { title: "Gift cards", path: "harbor.example/gift-cards" },
];
// reset · three pages read · business · greeting · questions · hold · fade
const DRAFT_STEPS = [500, 700, 700, 700, 700, 900, 1300, 2600, 600] as const;

/** Reading a website: What it knows learning it, and the agent's first draft filling in. */
export function DraftVisual() {
  const { ref, step, loops } = useLoop(DRAFT_STEPS, 7);
  const on = (from: number) => step < 8 && step >= from;
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <Backdrop tone="cool" className="h-[560px] p-5">
        <AppWindow icon={<BookOpenText className="size-4" />} title="What it knows" className="ml-auto sm:w-[86%]" bodyClassName="p-3">
          <ul className="card divide-y divide-line overflow-hidden">
            {DRAFT_PAGES.map((p, i) => (
              <Reveal key={p.path} on={on(i + 1)} as="div" className="flex items-center gap-2.5 px-3 py-2.5">
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel-2 text-muted">
                  <Globe className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{p.title}</span>
                  <span className="block truncate text-[11px] text-muted">{p.path}</span>
                </span>
                <SourceState state={on(i + 2) || on(4) ? "ready" : "learning"} />
              </Reveal>
            ))}
          </ul>
          <p className="mt-2.5 flex h-5 items-center gap-2 text-xs text-muted">
            {on(1) && !on(4) ? (
              <>
                <Spinner className="size-3.5 text-brand" /> Reading harbor.example… <Count key={loops} to={18} ms={2100} /> pages so far
              </>
            ) : on(4) ? (
              <>
                <Check className="size-3.5 text-good" /> Read 18 pages
              </>
            ) : null}
          </p>
        </AppWindow>
      </Backdrop>

      <div className="card absolute bottom-4 left-4 w-[268px] overflow-hidden shadow-raised sm:w-[285px]">
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
          <span className="inline-flex size-6 items-center justify-center rounded-md bg-brand-tint text-brand">
            <Sparkles className="size-3.5" />
          </span>
          <span className="text-sm font-semibold">Your agent&apos;s first draft</span>
        </div>
        <div className="space-y-2.5 p-3.5">
          <DraftField label="Business" on={on(4)}>
            Harbor Goods
          </DraftField>
          <DraftField label="Greeting" on={on(5)}>
            Hi! Welcome to Harbor Goods. How can I help?
          </DraftField>
          <div>
            <p className="mb-1 text-xs font-medium">Questions customers ask</p>
            <div className="flex min-h-[24px] flex-wrap gap-1.5">
              {["How long does shipping take?", "What's your return policy?"].map((q, i) => (
                <Reveal key={q} as="span" from="scale" on={on(6)} style={{ transitionDelay: on(6) ? `${i * 220}ms` : "0ms" }} className="rounded-full border border-line px-2.5 py-0.5 text-[11px]">
                  {q}
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A field of the draft, as the dashboard's forms draw one: empty, then filled in. */
function DraftField({ label, on, children }: { label: string; on: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium">{label}</p>
      <div className="field min-h-[34px] px-2.5 py-1.5 text-[12px] leading-snug">
        <Reveal on={on} from="left" as="span" className="block">
          {children}
        </Reveal>
      </div>
    </div>
  );
}

const TEST_ROWS = [
  { name: "Refund after 40 days", criterion: "Explains the 30-day window and offers the team.", ok: true, score: 96 },
  { name: "Discount code", criterion: "Says there's no code, without inventing one.", ok: true, score: 100 },
  { name: "Late parcel, upset", criterion: "Apologises, checks the order and offers the team.", ok: true, score: 88 },
  { name: "Are returns free?", criterion: "Says UK returns are free and EU customers pay the postage.", ok: false, score: 30 },
];
// reset · four customers, each running then judged · hold · fade
const TESTS_STEPS = [400, 800, 800, 800, 800, 900, 2400, 500] as const;

/** The Tests page as a run finishes: each AI customer runs in turn, then its result. */
export function TestRunVisual() {
  const { ref, step } = useLoop(TESTS_STEPS, 6);
  const on = (from: number) => step < 7 && step >= from;
  const done = TEST_ROWS.filter((_, i) => on(i + 2)).length;
  return (
    <div ref={ref} className="font-sans">
      <Backdrop className="h-[300px] rounded-none px-5 pt-5">
        <div className="card overflow-hidden shadow-raised">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs text-muted">
            <span>
              Latest results: <span className="font-semibold text-text">{TEST_ROWS.filter((r, i) => r.ok && on(i + 2)).length}</span> of {done} passed
            </span>
            {on(1) && !on(5) && (
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Spinner className="size-3.5" /> Tests running
              </span>
            )}
          </div>
          <ul className="divide-y divide-line">
            {TEST_ROWS.map((r, i) => (
              <li key={r.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted">{r.criterion}</span>
                </span>
                <span className="shrink-0">{on(i + 2) ? <Result state={r.ok ? "passed" : "failed"} score={r.score} /> : <Result state={on(i + 1) ? "running" : "waiting"} />}</span>
              </li>
            ))}
          </ul>
        </div>
      </Backdrop>
    </div>
  );
}

// reset · answer · press the source · passage · highlight · hold · fade
const SOURCE_STEPS = [400, 1000, 800, 700, 1300, 2300, 500] as const;

/** An answer opened to the passage it came from, as the chat shows it. */
export function SourceVisual() {
  const { ref, step } = useLoop(SOURCE_STEPS, 5);
  const on = (from: number) => step < 6 && step >= from;
  return (
    <div ref={ref}>
      <Backdrop className="h-[300px] rounded-none px-5 pt-5">
        <ChatColours className="space-y-2 rounded-xl border border-line bg-white p-4 shadow-raised">
          <Reveal on={on(1)} className="relative space-y-1.5">
            <Answer text="Standard UK delivery is free on orders over £50 and takes 3 to 5 working days. [1]" />
            <div className="relative">
              <From title="Delivery › UK" opened={on(2)} />
              <Cursor x="96px" y={on(2) ? "6px" : "36px"} show={on(1) && !on(4)} pressing={step === 2} />
            </div>
          </Reveal>
          <Reveal on={on(3)} className="max-w-[92%] rounded-lg border border-[var(--c-line)] bg-[var(--c-chip-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--c-muted)]">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-[var(--c-text)]">
              <FileText className="size-3.5" /> Delivery › UK
            </p>
            <p>
              <mark
                className={`rounded bg-transparent bg-no-repeat px-0.5 text-[var(--c-text)] ${on(4) ? "transition-[background-size] duration-[1100ms] ease-out" : "transition-none"}`}
                style={{ backgroundImage: "linear-gradient(#fff1b8, #fff1b8)", backgroundSize: on(4) ? "100% 100%" : "0% 100%" }}
              >
                Standard delivery: 3 to 5 working days, £4.95. Free on orders over £50.
              </mark>
              {" "}Express delivery: the next working day, £9.95.
            </p>
          </Reveal>
        </ChatColours>
      </Backdrop>
    </div>
  );
}

const LAYOUTS: ChatLayout[] = ["bubble", "panel", "focus", "inline", "page"];
const STYLES: ChatStyle[] = ["classic", "bold", "minimal", "soft"];
const LAYOUT_STEPS = [1900, 1900, 1900, 1900, 1900] as const;

/** On your website: it steps through the ways to show the chat, with a preview of each on a page. */
export function LayoutMenuVisual() {
  const { ref, step } = useLoop(LAYOUT_STEPS, 1);
  const layout = LAYOUTS[step];
  const style = STYLES[step % STYLES.length];
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[580px] font-sans">
      <AppWindow
        icon={<Radio className="size-4" />}
        title="On your website"
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium">
            {LAYOUT_INFO[layout].name} <ChevronsUpDown className="size-3.5 text-muted" />
          </span>
        }
        bodyClassName="grid gap-3 p-3 sm:grid-cols-[200px_1fr]"
      >
        <div className="rounded-xl border border-line bg-panel p-1.5 text-sm shadow-raised">
          <p className="eyebrow px-2.5 pb-1 pt-1.5">Chat channel layout</p>
          {LAYOUTS.map((l) => (
            <div key={l} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 transition-colors duration-300 ${l === layout ? "bg-panel-2" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{LAYOUT_INFO[l].name}</span>
              </span>
              {l === layout && <Check className="mt-0.5 size-4 text-brand" />}
            </div>
          ))}
          <div className="mt-1 border-t border-line px-2.5 pt-2">
            <p className="text-[11px] text-muted">Style</p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {STYLES.map((s) => (
                <span key={s} className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors duration-300 ${s === style ? "border-brand bg-brand-tint text-brand" : "border-line text-muted"}`}>
                  {STYLE_INFO[s].name}
                </span>
              ))}
            </div>
          </div>
        </div>
        <PagePreview layout={layout} style={style} />
      </AppWindow>
    </div>
  );
}

/** A sample page, with the chat where the layout puts it. */
function PagePreview({ layout, style }: { layout: ChatLayout; style: ChatStyle }) {
  const header = style === "bold" ? "#2348d8" : style === "soft" ? "#e9eefc" : "#fafafb";
  const chat = (
    <span className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-white shadow-raised">
      <span className="flex h-5 shrink-0 items-center gap-1 px-1.5" style={{ background: header }}>
        <span className="size-2.5 rounded-full bg-[#2348d8]" style={{ opacity: style === "bold" ? 0.4 : 1 }} />
      </span>
      <span className="flex-1 space-y-1 p-1.5">
        <span className="block h-2 w-3/4 rounded bg-panel-2" />
        <span className="ml-auto block h-2 w-1/2 rounded" style={{ background: style === "minimal" ? "#e9ebef" : "#2348d8" }} />
        <span className="block h-2 w-2/3 rounded bg-panel-2" />
      </span>
    </span>
  );
  const piece = (shown: boolean, className: string, child: React.ReactNode, hidden = "scale-90 opacity-0") => (
    <span className={`absolute transition-all duration-500 ${shown ? "scale-100 opacity-100" : hidden} ${className}`}>{child}</span>
  );
  return (
    <div className="relative min-h-[210px] overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-1.5 border-b border-line bg-panel-2/60 px-2.5 py-1.5">
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="size-2 rounded-full bg-line-strong" />
        <span className="ml-1.5 rounded bg-panel px-2 py-0.5 text-[10px] text-muted">harbor.example</span>
      </div>
      <div className="space-y-1.5 p-3">
        <div className="h-2.5 w-2/5 rounded bg-panel-3" />
        <div className="h-2 w-4/5 rounded bg-panel-2" />
        <div className="h-2 w-3/5 rounded bg-panel-2" />
      </div>
      {piece(layout === "bubble", "bottom-3 right-3 size-8", <span className="block size-8 rounded-full bg-[#2348d8] shadow-raised" />, "scale-50 opacity-0")}
      {piece(layout === "panel", "inset-y-[29px] right-0 h-auto w-[44%]", chat, "translate-x-full opacity-0")}
      {piece(layout === "focus", "inset-x-[18%] bottom-3 top-[46px]", chat)}
      {piece(layout === "inline", "bottom-3 left-3 right-3 top-[86px]", chat)}
      {piece(layout === "page", "inset-x-0 bottom-0 top-[29px]", <span className="block h-full bg-white p-3">{chat}</span>, "opacity-0")}
      <span className="absolute bottom-2 left-3">
        <Pill tone="good">Live preview</Pill>
      </span>
    </div>
  );
}
