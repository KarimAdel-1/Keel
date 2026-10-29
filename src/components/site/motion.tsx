"use client";

// The website's pictures play like short videos, on a playhead that loops while they're on screen: a customer types into
// the message box and sends, the agent writes, its answer streams in a word at a time, tests run and pass. They play for
// every visitor, whatever their device's motion setting. Numbers count with requestAnimationFrame.

import { MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (change: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};

/** Whether the visitor asked for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/**
 * A looping playhead: how far into its loop of `length` ms the picture is, ticking about 25 times a second while the
 * element (`ref`) is on screen, and picking up where it left off when it comes back.
 */
export function usePlayhead(length: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  const at = useRef(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const began = performance.now() - at.current;
    const timer = setInterval(() => {
      at.current = (performance.now() - began) % length;
      setT(at.current);
    }, 40);
    return () => clearInterval(timer);
  }, [visible, length]);

  return { ref, t };
}

/** The step a playhead is in, when a picture moves in steps: `steps[i]` is how long step i lasts. */
export function stepAt(t: number, steps: readonly number[]): number {
  let end = 0;
  for (let i = 0; i < steps.length; i++) {
    end += steps[i];
    if (t < end) return i;
  }
  return steps.length - 1;
}

/** How fast people type (ms a character) and answers stream in (ms a word). */
const TYPE = 42;
const STREAM = 65;

const wordsOf = (text: string) => text.match(/\S+\s*/g) ?? [];

/** How long a person takes to type `text`, and an answer takes to stream in. */
export const typingTime = (text: string) => text.length * TYPE;
export const streamingTime = (text: string) => wordsOf(text).length * STREAM;

/** What a person has typed of `text` by `t`, having started at `from`. */
export const typedAt = (text: string, t: number, from: number) => text.slice(0, Math.max(0, Math.floor((t - from) / TYPE)));

/** What has streamed in of an answer by `t`, having started at `from`: a word at a time. */
export const streamedAt = (text: string, t: number, from: number) => wordsOf(text).slice(0, Math.max(0, Math.floor((t - from) / STREAM))).join("");

/**
 * When each part of one exchange happens, from `start`: the customer types the question and sends it, the agent writes
 * (its dots show), then its answer streams in until `answered`.
 */
export function exchangeAt(question: string, answer: string, start: number) {
  const sent = start + typingTime(question) + 450;
  const answering = sent + 1400;
  return { start, sent, answering, answered: answering + streamingTime(answer) };
}

/** A text cursor, blinking where the next character goes. */
export function Caret() {
  return <span aria-hidden className="site-caret" />;
}

/** Shows its children when `on`, with a quick fade, keeping their place either way so nothing around them moves. */
export function Appear({ on, children, className = "" }: { on: boolean; children: ReactNode; className?: string }) {
  return <div className={`transition-opacity duration-300 ${on ? "opacity-100" : "pointer-events-none opacity-0"} ${className}`}>{children}</div>;
}

/**
 * An answer as it streams in, a word at a time from `from`. Its whole text holds its place, unseen, so nothing moves as
 * the words arrive; the agent's dots show in that place while it's still writing (from `writing`).
 */
export function Streamed({ text, t, from, writing, after, className = "" }: { text: string; t: number; from: number; writing?: number; after?: ReactNode; className?: string }) {
  const shown = streamedAt(text, t, from);
  return (
    <div className={`relative ${className}`}>
      <span className="invisible">
        {text}
        {after}
      </span>
      <span className="absolute inset-0">
        {shown}
        {t >= from + streamingTime(text) && after}
      </span>
      {writing !== undefined && t >= writing && t < from && (
        <span className="absolute left-0 top-0 flex h-[1.7em] items-center">
          <TypingDots />
        </span>
      )}
    </div>
  );
}

/** A number counting up from `from` to `to` once it mounts. Give it a new key to count again. */
export function Count({ to, from = 0, ms = 1200, decimals = 0, suffix = "" }: { to: number; from?: number; ms?: number; decimals?: number; suffix?: string }) {
  const [value, setValue] = useState(from);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const p = Math.min(1, (now - start) / ms);
      setValue(from + (to - from) * (1 - (1 - p) ** 3));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, from, ms, reduced]);
  return (
    <span className="tabular-nums">
      {(reduced ? to : value).toFixed(decimals)}
      {suffix}
    </span>
  );
}

/** Three dots: someone is writing. */
export function TypingDots({ className = "bg-[#9aa0aa]" }: { className?: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`site-dot size-1.5 rounded-full ${className}`} style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

/** A pointer that glides to a spot in the picture, and presses when `pressing`. */
export function Cursor({ x, y, show = true, pressing = false }: { x: string; y: string; show?: boolean; pressing?: boolean }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute z-20 transition-all duration-700 ease-in-out ${show ? "opacity-100" : "opacity-0"}`} style={{ left: x, top: y }}>
      <MousePointer2 className={`size-5 fill-white text-[#111214] drop-shadow transition-transform duration-150 ${pressing ? "scale-75" : "scale-100"}`} />
      {pressing && <span className="site-ping absolute -left-2 -top-2 size-8 rounded-full bg-[#2348d8]/25" />}
    </span>
  );
}

/** A bar that fills to `to` percent over `ms`, and empties at once when it goes back to 0. */
export function Fill({ to, ms = 1500, className = "bg-[#2348d8]" }: { to: number; ms?: number; className?: string }) {
  return <span className={`block h-full rounded-full ${className} ${to ? "transition-[width] ease-out" : "transition-none"}`} style={{ width: `${to}%`, transitionDuration: to ? `${ms}ms` : "0ms" }} />;
}
