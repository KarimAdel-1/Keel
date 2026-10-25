"use client";

import { ArrowDown, ArrowRight, BookOpen, Check, ChevronRight, FileText, Globe, MessageSquare, MoreHorizontal, Play, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

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

function Tag({ children, status = false }: { children: ReactNode; status?: boolean }) {
  return <span className={`demo-tag ${status ? "demo-tag-status" : ""}`}>{status && <Check size={12} />}{children}</span>;
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
function Chat({ action = false }: { action?: boolean }) {
  return <>
    <div className="demo-message demo-message-user">{action ? "Where’s my order HG-1042?" : "Can I return a gift without a receipt?"}</div>
    <div className="demo-byline"><span className="demo-avatar">HG</span>Harbor Goods <span>Assistant</span></div>
    <div className="demo-message">{action ? "Your order is out for delivery. Here’s the latest update." : "Yes. Gifts can be returned within 30 days for a gift card of the same value. You won’t need the original receipt."}</div>
    {action ? <Card title="Order HG-1042" aside={<Tag>In transit</Tag>}><ol className="demo-tracker">{["Confirmed", "Packed", "Out for delivery"].map((s,i) => <li key={s}><span>{i < 2 ? <Check size={12}/> : "3"}</span>{s}</li>)}</ol><p className="demo-note">Estimated delivery · Today, by 6pm</p></Card> : <div className="demo-citation"><BookOpen size={14}/><span>Returns & refunds · Gift returns</span><ChevronRight size={14}/></div>}
  </>;
}
function Results({ quality = false, security = false }: { quality?: boolean; security?: boolean }) {
  const rows = security ? ["Instruction override", "Sensitive information", "Unsafe request"] : ["Delivery options", "Gift returns", "Damaged item"];
  return <>
    <Metrics items={quality ? [["Answer score", "9.1 / 10", "Example review"], ["To review", "1", "Answer needs a source"]] : [[security ? "Checks passed" : "Tests passed", "11 / 12", "Example run"], ["Needs attention", "1", "Review the evidence"]]}/>
    <Card title={quality ? "Answer review" : security ? "Latest security checks" : "Latest test results"} aside={<Tag>Completed</Tag>}>
      {rows.map((s,i) => <Row key={s} title={s} detail={i === 2 ? "Open the finding for details" : "Matches the expected result"} right={i === 2 ? <span className="demo-review">Review</span> : <Tag status>Passed</Tag>}/>)}
    </Card>
    <details className="demo-evidence"><summary>{security ? "View flagged attempt" : "Why this needs attention"}<ChevronRight size={14}/></summary><p>{security ? "A reply repeated text from an unsafe request. Inspect the conversation and test a proposed change before applying it." : "The reply promised a replacement before checking the breakages policy. The agent should confirm eligibility from its source first."}</p><span className="demo-note">Evidence · Example conversation and source</span></details>
  </>;
}
function Knowledge() {
  return <><div className="demo-url"><Globe size={16}/><span>harbor.example</span><Tag status>Imported</Tag></div><Card title="Knowledge sources" aside={<span className="demo-note">3 ready</span>}>{[["Website pages","18 pages · Synced today"],["Returns & refunds","PDF · 6 pages"],["Delivery questions","12 questions and answers"]].map(([title,detail]) => <Row key={title} icon={<FileText size={16}/>} title={title} detail={detail} right={<Tag status>Ready</Tag>}/>)}</Card><div className="demo-inline-note"><BookOpen size={17}/><span>Answers can cite the exact page or document they use.</span></div></>;
}
function Improvement({ copilot = false }: { copilot?: boolean }) {
  return <><div className="demo-byline"><span className="demo-avatar">k.</span>{copilot ? "Copilot" : "Improvement review"}<Tag>Draft</Tag></div><h3 className="demo-finding">Make the breakages policy explicit.</h3><p className="demo-note">The failed test shows the agent asks customers to return damaged items. Your policy allows a replacement without a return.</p><Card title="Proposed instruction"><div className="demo-change"><span>ADD</span><p>For items damaged on arrival, offer a replacement or refund. Do not ask the customer to return the damaged item.</p></div></Card><div className="demo-proof"><ShieldCheck size={17}/><span>3 fresh runs passed · Other tests still passing</span></div><details className="demo-evidence"><summary>Review the supporting evidence<ChevronRight size={14}/></summary><p>Source: Breakages policy. The updated instruction was tried on a copy of the agent against the original failure and the remaining tests.</p></details><div className="demo-review-footer"><span>Waiting for your approval</span><span className="demo-button">Review change <ArrowRight size={13}/></span></div></>;
}
function LayoutPreview() {
  const [layout,setLayout]=useState("Bubble");
  return <><div className="demo-options" aria-label="Example chat layouts">{["Bubble","Panel","Page"].map(x => <button type="button" key={x} aria-pressed={layout===x} onClick={()=>setLayout(x)}>{x}</button>)}</div><div className={`demo-store demo-store-${layout.toLowerCase()}`}><div className="demo-store-nav"><strong>HARBOR GOODS</strong><span>Shop · Our story</span></div><div className="demo-store-title">Made for<br/>every day.</div><div className="demo-store-product"><div/><div/><div/></div><div className="demo-store-chat"><span className="demo-avatar">HG</span><strong>How can we help?</strong><p>Orders, returns, or a little advice.</p><div className="demo-compose">Ask a question… <ArrowRight size={14}/></div></div></div><p className="demo-note">Preview only · Your customer-facing colors remain your choice.</p></>;
}
function Content({ kind }: { kind: DemoKind }) {
  switch(kind) {
    case "hero": return <Chat/>;
    case "draft": return <Knowledge/>;
    case "source": return <><div className="demo-message">Gifts can be returned within 30 days for a gift card. <span className="demo-reference">[1]</span></div><Card title="Returns & refunds" aside={<Tag>Source 1</Tag>}><span className="demo-note">Section 03 / Gift returns</span><blockquote className="demo-quote">“Gift recipients may return an item within 30 days of delivery in exchange for a gift card of the same value.”</blockquote><div className="demo-citation"><Globe size={14}/> harbor.example/returns</div></Card><div className="demo-inline-note"><Check size={16}/>The answer and its source, side by side.</div></>;
    case "actions": return <><Row icon={<Globe size={16}/>} title="Look up an order" detail="Action · Connected to your API" right={<Tag status>Enabled</Tag>}/><div className="demo-divider"/><Chat action/></>;
    case "testRun": return <Results/>;
    case "quality": return <Results quality/>;
    case "scan": return <Results security/>;
    case "improve": return <Improvement/>;
    case "copilot": return <Improvement copilot/>;
    case "layout": return <LayoutPreview/>;
    case "setup": return <><Metrics items={[["Conversations","128","Last 7 days"],["Tests passed","11 / 12","Latest run"]]}/><Card title="Needs attention" aside={<Tag>2 items</Tag>}><Row icon={<MessageSquare size={16}/>} title="One answer needs a source" detail="Review its findings in Quality" right={<ChevronRight size={16}/>}/><Row icon={<ShieldCheck size={16}/>} title="Review your safety settings" detail="Open Safety and limits" right={<ChevronRight size={16}/>}/></Card><div className="demo-workspace">{["Knowledge","Actions","Widgets"].map(x=><div key={x}><strong>{x}</strong><ArrowRight size={14}/></div>)}</div></>;
    case "procedure": return <><Row icon={<FileText size={16}/>} title="Handle a return" detail="Retail template · 4 steps" right={<Tag status>Enabled</Tag>}/><ol className="demo-steps">{[["Understand the request","Ask for the order number and reason."],["Check the policy","Confirm the return window and eligibility."],["Offer the right next step","Explain replacement or refund options."],["Bring in your team","Create a ticket if a person needs to decide."]].map(([title,detail],i)=><li key={title}><span>{String(i+1).padStart(2,"0")}</span><div><strong>{title}</strong><p>{detail}</p></div>{i<3&&<ArrowDown size={13}/>}</li>)}</ol></>;
    case "inbox": return <><div className="demo-ticket-top"><span>Ticket #1042</span><Tag>Needs your team</Tag></div><h3 className="demo-finding">A replacement for a damaged mug</h3><Row title="Alex Morgan" detail="Customer · Today, 10:42" icon={<span>AM</span>}/><div className="demo-message demo-message-user">The mug arrived cracked. Can you help?</div><Card title="Handover summary"><p>The customer reported damage on arrival. Order HG-1042 is confirmed. They would prefer a replacement.</p><div className="demo-divider"/><Row title="Order HG-1042" detail="Stoneware mug · £24" right={<Tag>Verified</Tag>}/></Card><div className="demo-compose">Reply to Alex… <ArrowRight size={15}/></div></>;
    case "analytics": return <><Metrics items={[["Conversations","1,284","Last 30 days"],["Team handovers","48","3.7% of conversations"]]}/><Card title="Conversation volume" aside={<span className="demo-note">Daily</span>}><div className="demo-chart" role="img" aria-label="Example chart of daily conversation volume">{[26,40,32,56,44,69,50,42,61,74,60,83,70,90,78,95].map((n,i)=><div key={i} style={{height:`${n}%`}}/>)}</div><div className="demo-chart-axis"><span>1 Oct</span><span>15 Oct</span><span>30 Oct</span></div></Card><Row title="Most common topic" detail="Delivery and order status" right={<Tag>38%</Tag>}/></>;
  }
}

/** Editorial product examples: scoped styles, no API calls, all figures explicitly illustrative. */
export function ProductDemo({ kind = "hero" }: { kind?: DemoKind }) {
  const info=INFO[kind];
  return <figure className="product-demo">
    <div className="demo-stage"><div className="demo-window">
      <div className="demo-chrome"><svg viewBox="0 0 393 196" width="62" height="31" aria-label="Keel"><image href="/brand/keel-logo.png" width="393" height="196"/></svg><span className="demo-chrome-divider"/><span>Harbor Goods</span><span className="demo-example">Example workspace</span><MoreHorizontal size={16}/></div>
      <div className="demo-page-head"><span>{info.page}</span><span className="demo-window-dot"/></div>
      <div className="demo-content" key={kind}><Content kind={kind}/></div>
    </div></div>
    <figcaption><span className="demo-caption-icon"><Play size={12}/></span><span><strong>{info.title}</strong><span>{info.caption}</span></span></figcaption>
  </figure>;
}
