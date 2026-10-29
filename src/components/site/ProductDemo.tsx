"use client";

import { ArrowDown, ArrowRight, BookOpen, Check, ChevronRight, FileText, Globe, LoaderCircle, MessageSquare, MoreHorizontal, Play, ShieldCheck } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { InputShell, SendButton } from "../chat/parts";
import { ChatColours } from "./app-ui";
import { Appear, Caret, exchangeAt, stepAt, Streamed, streamingTime, typedAt, typingTime, usePlayhead } from "./motion";

export type DemoKind = "hero" | "setup" | "draft" | "source" | "actions" | "procedure" | "testRun" | "quality" | "scan" | "layout" | "inbox" | "analytics" | "improve" | "copilot";
const INFO: Record<DemoKind, { page: string; title: string; caption: string }> = {
  hero: { page: "Conversations", title: "An answer. With something behind it.", caption: "A customer question, answered from the business’s own policy." },
  setup: { page: "Home", title: "Know what needs your attention.", caption: "Home brings the next steps together. Each opens the right page." },
  draft: { page: "Knowledge", title: "Your business, ready to answer.", caption: "Website pages and documents become sources your agent can use." },
  source: { page: "Answer evidence", title: "See where an answer comes from.", caption: "The original passage stays one click away from the reply." },
  actions: { page: "Actions", title: "From a question to a useful result.", caption: "An order lookup returns a clear status card inside the chat." },
  procedure: { page: "Step-by-step guides", title: "A consistent way to handle returns.", caption: "Guides give the agent a sequence to follow when a customer needs help." },
  testRun: { page: "Tests", title: "Find the gaps before customers do.", caption: "AI customers ask real questions. Results show what needs work." },
  quality: { page: "Quality", title: "The finding first. Evidence next.", caption: "Review answer quality and inspect the reasoning behind each result." },
  scan: { page: "Safety and limits", title: "Put your agent’s boundaries to the test.", caption: "Inspect flagged attempts and turn failures into improvements." },
  layout: { page: "On your website", title: "The same agent. Your own presentation.", caption: "Choose a chat layout and adjust its appearance before publishing." },
  inbox: { page: "Helpdesk inbox", title: "Your team picks up with context.", caption: "A handover keeps the customer’s request and conversation together." },
  analytics: { page: "Analytics", title: "Understand what customers need.", caption: "See conversation volume, common topics, and requests for your team." },
  improve: { page: "Improve", title: "Review the change. Keep the control.", caption: "Proposed fixes are tested on a copy and wait for your approval." },
  copilot: { page: "Ask Copilot", title: "A clear next step, with the details nearby.", caption: "Review a proposed change before applying it to your agent." },
};

// Each picture plays its own scene on a loop while it's on screen, timed in ms from the start of the loop. Where someone
// writes, it's written as it would be: a customer types into the message box and sends, the agent's dots show while it
// writes, and its answer streams in a word at a time.

const GIFT = { question: "Can I return a gift without a receipt?", answer: "Yes. Gifts can be returned within 30 days for a gift card of the same value. You won’t need the original receipt." };
const ORDER = { question: "Where’s my order HG-1042?", answer: "Your order is out for delivery. Here’s the latest update." };
const gift = exchangeAt(GIFT.question, GIFT.answer, 700);
const order = exchangeAt(ORDER.question, ORDER.answer, 700);
/** The order card comes once the answer is in; its steps tick off one after another. */
const lookup = order.answered + 300;

const EVIDENCE = "Gifts can be returned within 30 days for a gift card.";
const evidence = (() => {
  const from = 1100;
  const answered = from + streamingTime(EVIDENCE);
  return { writing: 300, from, answered, card: answered + 300, highlight: answered + 1000, note: answered + 1700 };
})();

const CHANGE = "For items damaged on arrival, offer a replacement or refund. Do not ask the customer to return the damaged item.";
const change = (() => {
  const from = 1900;
  const written = from + streamingTime(CHANGE);
  return { finding: 500, card: 1300, from, trying: written + 300, proven: written + 1900, footer: written + 2500 };
})();

const REPLY = "Sorry about that, Alex. A replacement is on its way today.";
const reply = (() => {
  const typing = 2600;
  return { message: 500, summary: 1400, typing, sent: typing + typingTime(REPLY) + 450 };
})();

/** The pictures that move in steps: each number is how long a step lasts. */
const STEPS = {
  results: [700, 800, 800, 800, 4200],
  draft: [600, 900, 800, 800, 800, 3800],
  procedure: [600, 1000, 1000, 1000, 1000, 3200],
  setup: [500, 800, 800, 800, 3800],
  analytics: [400, 1400, 900, 3800],
  layout: [2400, 2400, 2400],
};
const total = (steps: number[]) => steps.reduce((a, b) => a + b, 0);
const HOLD = 4000;

/** How long each picture's loop lasts. */
const LENGTH: Record<DemoKind, number> = {
  hero: gift.answered + HOLD,
  actions: lookup + 1300 + HOLD,
  source: evidence.note + HOLD,
  improve: change.footer + HOLD,
  copilot: change.footer + HOLD,
  inbox: reply.sent + HOLD,
  testRun: total(STEPS.results),
  quality: total(STEPS.results),
  scan: total(STEPS.results),
  draft: total(STEPS.draft),
  procedure: total(STEPS.procedure),
  setup: total(STEPS.setup),
  analytics: total(STEPS.analytics),
  layout: total(STEPS.layout),
};

function Tag({ children, status = false }: { children: ReactNode; status?: boolean }) {
  return <span className={`demo-tag ${status ? "demo-tag-status" : ""}`}>{status && <Check size={12} />}{children}</span>;
}
/** Work under way: a turning circle and what's happening. */
function Working({ children }: { children: ReactNode }) {
  return <span className="demo-tag"><LoaderCircle size={12} className="animate-spin" />{children}</span>;
}
function Card({ title, aside, children }: { title?: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="demo-card">{title && <div className="demo-card-head"><strong>{title}</strong>{aside}</div>}<div className="demo-card-body">{children}</div></section>;
}
function Row({ icon, title, detail, right }: { icon?: ReactNode; title: string; detail?: string; right?: ReactNode }) {
  return <div className="demo-row">{icon && <span className="demo-icon">{icon}</span>}<div className="demo-row-copy"><strong>{title}</strong>{detail && <span>{detail}</span>}</div>{right}</div>;
}
function Metrics({ items }: { items: [string, string, string][] }) {
  return <div className="demo-metrics">{items.map(([label, value, note]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>;
}

/**
 * The chat's own message box, as the website's chat pictures draw it: what's being typed into it, with its cursor, until
 * it's sent; send lights up once it's all typed.
 */
export function Compose({ text, t, from, sent, placeholder, className = "" }: { text: string; t: number; from: number; sent: number; placeholder: string; className?: string }) {
  const typing = t >= from && t < sent;
  return (
    <ChatColours className={className}>
      <InputShell>
        {typing ? <span className="flex-1 py-2 text-[14px]">{typedAt(text, t, from)}<Caret /></span> : <span className="flex-1 py-2 text-[14px] text-[var(--c-muted)]">{placeholder}</span>}
        <SendButton disabled={!typing || t < from + typingTime(text)} />
      </InputShell>
    </ChatColours>
  );
}

/** A customer types their question and sends it, the agent writes, then answers, with its source or the order it looked up. */
function Chat({ t, action = false }: { t: number; action?: boolean }) {
  const { question, answer } = action ? ORDER : GIFT;
  const x = action ? order : gift;
  return <>
    <Appear on={t >= x.sent} className="demo-message demo-message-user">{question}</Appear>
    <Appear on={t >= x.sent + 300} className="demo-byline"><span className="demo-avatar">HG</span>Harbor Goods <span>Assistant</span></Appear>
    <Streamed text={answer} t={t} from={x.answering} writing={x.sent + 300} className="demo-message" />
    {action
      ? <Appear on={t >= lookup}><Card title="Order HG-1042" aside={t >= lookup + 1300 ? <Tag>In transit</Tag> : <Working>Looking up</Working>}><ol className="demo-tracker">{["Confirmed", "Packed", "Out for delivery"].map((step, i) => <li key={step} className={t >= lookup + 600 * i ? "is-on" : ""}><span>{i < 2 && t >= lookup + 600 * (i + 1) ? <Check size={12} /> : i + 1}</span>{step}</li>)}</ol><p className="demo-note">Estimated delivery · Today, by 6pm</p></Card></Appear>
      : <Appear on={t >= x.answered + 250} className="demo-citation"><BookOpen size={14} /><span>Returns & refunds · Gift returns</span><ChevronRight size={14} /></Appear>}
    <Compose text={question} t={t} from={x.start} sent={x.sent} placeholder="Ask a question…" className="mt-auto" />
  </>;
}

/** A run: each check works, then passes (the last needs a look), and the totals add up as they finish. */
function Results({ t, quality = false, security = false }: { t: number; quality?: boolean; security?: boolean }) {
  const s = stepAt(t, STEPS.results);
  const rows = security ? ["Instruction override", "Sensitive information", "Unsafe request"] : ["Delivery options", "Gift returns", "Damaged item"];
  const done = Math.min(s, 3);
  const first = quality ? `${["–", "8.8", "9.0", "9.1"][done]} / 10` : `${[0, 4, 8, 11][done]} / 12`;
  return <>
    <Metrics items={quality ? [["Answer score", first, "Example review"], ["To review", done === 3 ? "1" : "0", "Answer needs a source"]] : [[security ? "Checks passed" : "Tests passed", first, "Example run"], ["Needs attention", done === 3 ? "1" : "0", "Review the evidence"]]} />
    <Card title={quality ? "Answer review" : security ? "Latest security checks" : "Latest test results"} aside={done === 3 ? <Tag>Completed</Tag> : <Working>Running</Working>}>
      {rows.map((row, i) => <Row key={row} title={row} detail={i === 2 ? "Open the finding for details" : "Matches the expected result"} right={s <= i ? <Working>Running</Working> : i === 2 ? <span className="demo-review">Review</span> : <Tag status>Passed</Tag>} />)}
    </Card>
    <Appear on={s >= 4}><details className="demo-evidence"><summary>{security ? "View flagged attempt" : "Why this needs attention"}<ChevronRight size={14} /></summary><p>{security ? "A reply repeated text from an unsafe request. Inspect the conversation and test a proposed change before applying it." : "The reply promised a replacement before checking the breakages policy. The agent should confirm eligibility from its source first."}</p><span className="demo-note">Evidence · Example conversation and source</span></details></Appear>
  </>;
}

/** A website read, then each source learned in turn. */
function Knowledge({ t }: { t: number }) {
  const s = stepAt(t, STEPS.draft);
  const ready = Math.max(0, Math.min(3, s - 1));
  return <>
    <div className="demo-url"><Globe size={16} /><span>harbor.example</span>{s >= 1 ? <Tag status>Imported</Tag> : <Working>Reading</Working>}</div>
    <Card title="Knowledge sources" aside={<span className="demo-note">{ready} ready</span>}>
      {[["Website pages", "18 pages · Synced today"], ["Returns & refunds", "PDF · 6 pages"], ["Delivery questions", "12 questions and answers"]].map(([title, detail], i) => <Row key={title} icon={<FileText size={16} />} title={title} detail={detail} right={i < ready ? <Tag status>Ready</Tag> : s >= 1 ? <Working>Learning</Working> : <Tag>Waiting</Tag>} />)}
    </Card>
    <Appear on={s >= 5} className="demo-inline-note"><BookOpen size={17} /><span>Answers can cite the exact page or document they use.</span></Appear>
  </>;
}

/** What went wrong, then the change written out, then proven on fresh runs before it waits for you. */
function Improvement({ t, copilot = false }: { t: number; copilot?: boolean }) {
  return <>
    <div className="demo-byline"><span className="demo-avatar">k.</span>{copilot ? "Copilot" : "Improvement review"}<Tag>Draft</Tag></div>
    <Appear on={t >= change.finding} className="flex flex-col gap-2"><h3 className="demo-finding">Make the breakages policy explicit.</h3><p className="demo-note">The failed test shows the agent asks customers to return damaged items. Your policy allows a replacement without a return.</p></Appear>
    <Appear on={t >= change.card}><Card title="Proposed instruction"><div className="demo-change"><span>ADD</span><Streamed text={CHANGE} t={t} from={change.from} writing={change.card} className="flex-1" /></div></Card></Appear>
    <Appear on={t >= change.trying} className="demo-proof">{t >= change.proven ? <><ShieldCheck size={17} /><span>3 fresh runs passed · Other tests still passing</span></> : <><LoaderCircle size={17} className="animate-spin" /><span>Trying it on a copy of your agent…</span></>}</Appear>
    <Appear on={t >= change.footer} className="flex flex-col gap-4"><details className="demo-evidence"><summary>Review the supporting evidence<ChevronRight size={14} /></summary><p>Source: Breakages policy. The updated instruction was tried on a copy of the agent against the original failure and the remaining tests.</p></details><div className="demo-review-footer"><span>Waiting for your approval</span><span className="demo-button">Review change <ArrowRight size={13} /></span></div></Appear>
  </>;
}

const LAYOUTS = ["Bubble", "Panel", "Page"];

/** The chat moving between layouts on its own, until a visitor picks one. */
function LayoutPreview({ t }: { t: number }) {
  const [picked, setPicked] = useState<string>();
  const layout = picked ?? LAYOUTS[stepAt(t, STEPS.layout)];
  return <><div className="demo-options" aria-label="Example chat layouts">{LAYOUTS.map(x => <button type="button" key={x} aria-pressed={layout === x} onClick={() => setPicked(x)}>{x}</button>)}</div><div className={`demo-store demo-store-${layout.toLowerCase()}`}><div className="demo-store-nav"><strong>HARBOR GOODS</strong><span>Shop · Our story</span></div><div className="demo-store-title">Made for<br />every day.</div><div className="demo-store-product"><div /><div /><div /></div><div className="demo-store-chat"><span className="demo-avatar">HG</span><strong>How can we help?</strong><p>Orders, returns, or a little advice.</p><div className="demo-compose">Ask a question… <ArrowRight size={14} /></div></div></div><p className="demo-note">Preview only · Your customer-facing colors remain your choice.</p></>;
}

/** A guide followed: each step lights up as the agent reaches it, and is ticked off once done. */
function Procedure({ t }: { t: number }) {
  const s = stepAt(t, STEPS.procedure);
  return <><Row icon={<FileText size={16} />} title="Handle a return" detail="Retail template · 4 steps" right={<Tag status>Enabled</Tag>} /><ol className="demo-steps">{[["Understand the request", "Ask for the order number and reason."], ["Check the policy", "Confirm the return window and eligibility."], ["Offer the right next step", "Explain replacement or refund options."], ["Bring in your team", "Create a ticket if a person needs to decide."]].map(([title, detail], i) => <li key={title} className={i + 1 === s ? "is-active" : i + 1 < s ? "is-done" : ""}><span>{i + 1 < s ? <Check size={12} /> : String(i + 1).padStart(2, "0")}</span><div><strong>{title}</strong><p>{detail}</p></div>{i < 3 && <ArrowDown size={13} />}</li>)}</ol></>;
}

/** A handover arrives with its summary, and the team types its reply and sends it. */
function Inbox({ t }: { t: number }) {
  return <>
    <div className="demo-ticket-top"><span>Ticket #1042</span><Tag>Needs your team</Tag></div>
    <Appear on={t >= reply.message} className="flex flex-col gap-4"><h3 className="demo-finding">A replacement for a damaged mug</h3><Row title="Alex Morgan" detail="Customer · Today, 10:42" icon={<span>AM</span>} /><div className="demo-message demo-message-user">The mug arrived cracked. Can you help?</div></Appear>
    <Appear on={t >= reply.summary}><Card title="Handover summary"><p>The customer reported damage on arrival. Order HG-1042 is confirmed. They would prefer a replacement.</p><div className="demo-divider" /><Row title="Order HG-1042" detail="Stoneware mug · £24" right={<Tag>Verified</Tag>} /></Card></Appear>
    <Appear on={t >= reply.sent} className="demo-proof"><Check size={15} /><span>Sent to Alex, in the chat they wrote from</span></Appear>
    <Compose text={REPLY} t={t} from={reply.typing} sent={reply.sent} placeholder="Reply to Alex…" />
  </>;
}

const VOLUME = [26, 40, 32, 56, 44, 69, 50, 42, 61, 74, 60, 83, 70, 90, 78, 95];

function Content({ kind, t }: { kind: DemoKind; t: number }) {
  switch (kind) {
    case "hero": return <Chat t={t} />;
    case "draft": return <Knowledge t={t} />;
    case "source": return <><Streamed text={EVIDENCE} t={t} from={evidence.from} writing={evidence.writing} after={<> <span className="demo-reference">[1]</span></>} className="demo-message" /><Appear on={t >= evidence.card}><Card title="Returns & refunds" aside={<Tag>Source 1</Tag>}><span className="demo-note">Section 03 / Gift returns</span><blockquote className={`demo-quote ${t >= evidence.highlight ? "is-on" : ""}`}>“Gift recipients may return an item within 30 days of delivery in exchange for a gift card of the same value.”</blockquote><div className="demo-citation"><Globe size={14} /> harbor.example/returns</div></Card></Appear><Appear on={t >= evidence.note} className="demo-inline-note"><Check size={16} />The answer and its source, side by side.</Appear></>;
    case "actions": return <><Row icon={<Globe size={16} />} title="Look up an order" detail="Action · Connected to your API" right={<Tag status>Enabled</Tag>} /><div className="demo-divider" /><Chat t={t} action /></>;
    case "testRun": return <Results t={t} />;
    case "quality": return <Results t={t} quality />;
    case "scan": return <Results t={t} security />;
    case "improve": return <Improvement t={t} />;
    case "copilot": return <Improvement t={t} copilot />;
    case "layout": return <LayoutPreview t={t} />;
    case "setup": {
      const s = stepAt(t, STEPS.setup);
      return <><Metrics items={[["Conversations", "128", "Last 7 days"], ["Tests passed", "11 / 12", "Latest run"]]} /><Card title="Needs attention" aside={<Tag>2 items</Tag>}><Appear on={s >= 1}><Row icon={<MessageSquare size={16} />} title="One answer needs a source" detail="Review its findings in Quality" right={<ChevronRight size={16} />} /></Appear><Appear on={s >= 2}><Row icon={<ShieldCheck size={16} />} title="Review your safety settings" detail="Open Safety and limits" right={<ChevronRight size={16} />} /></Appear></Card><Appear on={s >= 3} className="demo-workspace">{["Knowledge", "Actions", "Widgets"].map(x => <div key={x}><strong>{x}</strong><ArrowRight size={14} /></div>)}</Appear></>;
    }
    case "procedure": return <Procedure t={t} />;
    case "inbox": return <Inbox t={t} />;
    case "analytics": {
      const s = stepAt(t, STEPS.analytics);
      return <><Metrics items={[["Conversations", "1,284", "Last 30 days"], ["Team handovers", "48", "3.7% of conversations"]]} /><Card title="Conversation volume" aside={<span className="demo-note">Daily</span>}><div className="demo-chart" role="img" aria-label="Example chart of daily conversation volume">{VOLUME.map((n, i) => <div key={i} style={{ height: `${s >= 1 ? n : 6}%`, "--i": i } as CSSProperties} />)}</div><div className="demo-chart-axis"><span>1 Oct</span><span>15 Oct</span><span>30 Oct</span></div></Card><Appear on={s >= 2}><Row title="Most common topic" detail="Delivery and order status" right={<Tag>38%</Tag>} /></Appear></>;
    }
  }
}

/** A picture's caption: what it shows, in a line or two. Under the picture, or wherever the page puts it. */
export function DemoCaption({ kind }: { kind: DemoKind }) {
  const info = INFO[kind];
  return <div className="product-demo"><div className="demo-caption"><span className="demo-caption-icon"><Play size={12} /></span><span><strong>{info.title}</strong><span>{info.caption}</span></span></div></div>;
}

/**
 * Editorial product examples: scoped styles, no API calls, all figures explicitly illustrative. `fill` stretches the
 * picture to the height of what holds it, so pictures side by side line up; without `caption`, the page shows the
 * caption itself (DemoCaption).
 */
export function ProductDemo({ kind = "hero", fill = false, caption = true }: { kind?: DemoKind; fill?: boolean; caption?: boolean }) {
  const info = INFO[kind];
  const { ref, t } = usePlayhead(LENGTH[kind]);
  return <figure ref={ref} className={`product-demo ${fill ? "product-demo-fill" : ""}`}>
    <div className="demo-stage"><div className="demo-window">
      <div className="demo-chrome"><svg viewBox="0 0 393 196" width="62" height="31" aria-label="Keel"><image href="/brand/keel-logo.png" width="393" height="196" /></svg><span className="demo-chrome-divider" /><span>Harbor Goods</span><span className="demo-example">Example workspace</span><MoreHorizontal size={16} /></div>
      <div className="demo-page-head"><span>{info.page}</span><span className="demo-window-dot" /></div>
      <div className="demo-content"><Content kind={kind} t={t} /></div>
    </div></div>
    {caption && <figcaption className="demo-caption"><span className="demo-caption-icon"><Play size={12} /></span><span><strong>{info.title}</strong><span>{info.caption}</span></span></figcaption>}
  </figure>;
}
