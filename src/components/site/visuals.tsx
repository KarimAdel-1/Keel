"use client";
import { ChatWidget } from "../chat/ChatWidget";
import { SuggestionChips } from "../chat/parts";
import { Backdrop } from "../landing/visuals";
import { Agent, Answer, ChatWindowShell, Customer, From, Writing } from "./app-ui";
import { Cursor, Reveal, useLoop } from "./motion";
import { ProductDemo } from "./ProductDemo";
export type SiteVisual = "setup" | "draft" | "actions" | "procedure" | "testRun" | "quality" | "scan" | "layout" | "inbox" | "analytics" | "improve" | "copilot";
export function FeatureVisual({ kind }: { kind: SiteVisual }) { return <ProductDemo kind={kind}/>; }
const noop = () => undefined;
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

/** A readable example conversation; every answer remains available by scrolling. */
export function ExampleChat({business,turns}:{business:string;turns:ExampleTurn[]}) {
 return <div className="mx-auto w-full max-w-[520px] font-sans"><Backdrop className="p-4 sm:p-6"><ChatWindowShell name={business} subtitle="Example conversation" className="h-[500px]">
 {turns.map((t,i)=><div key={i} className="space-y-2">{t.from==="customer"?<Customer>{t.text}</Customer>:<>{t.source?<Answer text={`${t.text} [1]`}/>:<Agent>{t.text}</Agent>}{t.source&&<From title={t.source}/>} {t.tracker&&<ChatWidget widget={{type:"tracker",title:"Order HG-1043",steps:t.tracker,current:t.trackerAt??0}} agentId="" onSend={noop}/>} {t.form&&<ChatForm title="Your details" fields={t.form}/>}</>}</div>)}
 </ChatWindowShell></Backdrop><p className="mt-3 text-center text-xs text-muted">Illustrative conversation · Sample business and policy</p></div>;
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

