"use client";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChatWidget } from "../chat/ChatWidget";
import { Backdrop } from "../landing/visuals";
import { Agent, Answer, ChatColours, ChatWindowShell, Customer, From, Writing } from "./app-ui";
import type { IndustryScene as Scene } from "./industries";
import { Appear, exchangeAt, Streamed, streamedAt, streamingTime, typedAt, typingTime, usePlayhead } from "./motion";
import { Compose, ProductDemo } from "./ProductDemo";
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

/**
 * A message in a played conversation, and when it happens. A customer's is typed into the message box from `from` and
 * sent at `at`; the agent writes from `from` (its dots show), its answer streams in from `at` until `answered`, and
 * what it shows with the answer (its source, a tracker, a form) comes at `extras`.
 */
type Timed = { turn: ExampleTurn; from: number; at: number; answered: number; extras: number };

/** When each message of a conversation happens, when it all fades to start again, and how long a loop lasts. */
function scheduleOf(turns: ExampleTurn[]): { timed: Timed[]; fade: number; length: number } {
  let cursor = 600;
  const timed = turns.map((turn): Timed => {
    if (turn.from === "customer") {
      const at = cursor + typingTime(turn.text) + 450;
      const item = { turn, from: cursor, at, answered: at, extras: at };
      cursor = at + 600;
      return item;
    }
    const at = cursor + 1300;
    const answered = at + streamingTime(turn.text);
    const item = { turn, from: cursor, at, answered, extras: answered + 250 };
    cursor = item.extras + (turn.tracker || turn.form ? 1600 : 800);
    return item;
  });
  const fade = cursor + 3200;
  return { timed, fade, length: fade + 600 };
}

/** Messages that keep the newest in view: as they outgrow the window, they move up smoothly, the way a chat scrolls. */
function Thread({ children, fading = false }: { children: ReactNode; fading?: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const box = outer.current;
    const list = inner.current;
    if (!box || !list) return;
    const observer = new ResizeObserver(() => setLift(Math.max(0, list.offsetHeight - box.clientHeight)));
    observer.observe(list);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={outer} className={`absolute inset-4 overflow-hidden transition-opacity duration-500 ${fading ? "opacity-0" : ""}`}>
      <div ref={inner} className="space-y-3 transition-transform duration-500 ease-out" style={{ transform: `translateY(-${lift}px)` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * An example conversation, played as it would happen: the customer types into the message box and sends, the agent
 * writes, then its answer streams in, a word at a time, with what it shows after it; older messages move up as new ones
 * arrive. It loops while it's on screen.
 */
export function ExampleChat({ business, turns }: { business: string; turns: ExampleTurn[] }) {
  const { timed, fade, length } = useMemo(() => scheduleOf(turns), [turns]);
  const { ref, t } = usePlayhead(length);
  const typing = timed.find((m) => m.turn.from === "customer" && t >= m.from && t < m.at);
  return (
    <div ref={ref} className="mx-auto w-full max-w-[520px] font-sans">
      <Backdrop className="p-4 sm:p-6">
        <ChatWindowShell name={business} subtitle="Example conversation" className="h-[480px]" draft={typing && typedAt(typing.turn.text, t, typing.from)}>
          <Thread fading={t >= fade}>
            {timed
              .filter((m) => (m.turn.from === "customer" ? t >= m.at : t >= m.from))
              .map(({ turn, at, answered, extras }, i) => (
                <div key={i} className="site-fade-in space-y-2">
                  {turn.from === "customer" ? (
                    <Customer>{turn.text}</Customer>
                  ) : t < at ? (
                    <Writing />
                  ) : t < answered ? (
                    <Agent>{streamedAt(turn.text, t, at)}</Agent>
                  ) : (
                    <>
                      {turn.source ? <Answer text={`${turn.text} [1]`} /> : <Agent>{turn.text}</Agent>}
                      {t >= extras && (
                        <div className="site-fade-in space-y-2">
                          {turn.source && <From title={turn.source} />}
                          {turn.tracker && <ChatWidget widget={{ type: "tracker", title: "Order HG-1043", steps: turn.tracker, current: turn.trackerAt ?? 0 }} agentId="" onSend={noop} />}
                          {turn.form && <ChatForm title="Your details" fields={turn.form} />}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
          </Thread>
        </ChatWindowShell>
      </Backdrop>
      <p className="mt-3 text-center text-xs text-muted">Illustrative conversation · Sample business and policy</p>
    </div>
  );
}

/** A form in the chat, drawn the way the chat draws its forms (nothing to send here). */
function ChatForm({ title, fields, className = "max-w-[88%]" }: { title: string; fields: string[]; className?: string }) {
  return (
    <div className={`space-y-1.5 rounded-xl border border-[var(--c-line)] bg-[var(--c-chip-bg)] p-3 ${className}`}>
      <p className="text-sm font-semibold">{title}</p>
      {fields.map((f) => (
        <label key={f} className="block text-xs">
          <span className="mb-1 block text-[var(--c-muted)]">{f}</span>
          <span className="block h-6 rounded-lg border border-[var(--c-line)] bg-[var(--c-input-bg)]" />
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
          {i < parts.length - 1 && <span className="rounded bg-[var(--accent-tint)] px-1 text-[var(--accent)]">your business</span>}
        </span>
      ))}
    </>
  );
}

/** A business's initials, as its chat's avatar shows them: "Juniper & Co" → "JC". */
const initials = (name: string) => {
  const words = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  return words.length > 1 ? words[0][0] + words[words.length - 1][0] : name[0];
};

/** A card laid over an industry's photo, drawn with the home page's product-picture styles (globals.css, .product-demo). */
function PhotoCard({ children }: { children: ReactNode }) {
  return (
    <div className="product-demo">
      <div className="demo-window flex flex-col gap-3 p-4">{children}</div>
    </div>
  );
}

/**
 * An industry at work: a photo of that kind of business, and Keel answering one of its customers in two cards over its
 * lower half, clear of the faces. In the first the customer types their question and sends it, the agent writes, and
 * its answer streams in with its source; then the second brings what the agent showed with it (a tracker, time slots,
 * a table, a form, a button) or the rule it kept. It loops while it's on screen.
 */
export function IndustryPicture({ slug, photo, scene }: { slug: string; photo: string; scene: Scene }) {
  const reply = scene.reply.replace(/\s*\[1\]/g, "");
  const x = exchangeAt(scene.ask, reply, 700);
  const shows = x.answered + 500;
  const { ref, t } = usePlayhead(shows + 4500);
  return (
    <div className="mx-auto w-full max-w-[540px] font-sans">
      <div ref={ref} className="relative sm:pb-28 sm:pl-10">
        <div className="overflow-hidden rounded-[24px] shadow-[0_30px_60px_-30px_rgb(11_21_48/0.45)]">
          <Image src={`/images/industries/${slug}.jpg`} alt={photo} width={1000} height={800} sizes="(min-width: 1024px) 490px, (min-width: 640px) 540px, 100vw" priority className="aspect-[5/4] w-full object-cover" />
        </div>

        <div className="relative z-10 mx-4 -mt-16 rounded-[13px] shadow-[0_24px_48px_-20px_rgb(11_21_48/0.4)] sm:absolute sm:bottom-0 sm:left-0 sm:m-0 sm:w-[275px]">
          <PhotoCard>
            <div className="demo-byline">
              <span className="demo-avatar">{initials(scene.business)}</span>
              {scene.business} <span>Assistant</span>
            </div>
            <Appear on={t >= x.sent} className="demo-message demo-message-user">
              {scene.ask}
            </Appear>
            <Streamed text={reply} t={t} from={x.answering} writing={x.sent + 300} className="demo-message" />
            {scene.source && (
              <Appear on={t >= x.answered + 200} className="demo-citation">
                <BookOpen size={14} />
                <span>{scene.source}</span>
              </Appear>
            )}
            <Compose text={scene.ask} t={t} from={x.start} sent={x.sent} placeholder="Write a message…" />
          </PhotoCard>
        </div>

        <Appear on={t >= shows} className="relative z-10 mx-4 mt-3 rounded-2xl shadow-[0_24px_48px_-20px_rgb(11_21_48/0.4)] sm:absolute sm:-right-6 sm:top-[46%] sm:m-0 sm:w-[255px]">
          {scene.widget || scene.form ? (
            <ChatColours>
              {scene.widget && <ChatWidget widget={scene.widget} agentId="" onSend={noop} />}
              {scene.form && <ChatForm title={scene.form.title} fields={scene.form.fields} className="" />}
            </ChatColours>
          ) : (
            <PhotoCard>
              {scene.rule && (
                <div className="demo-proof">
                  <ShieldCheck size={17} className="shrink-0" />
                  <span>{scene.rule}</span>
                </div>
              )}
              {scene.button && (
                <span className="demo-button self-start">
                  {scene.button} <ArrowRight size={13} />
                </span>
              )}
            </PhotoCard>
          )}
        </Appear>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Illustrative conversation · Sample business</p>
    </div>
  );
}

