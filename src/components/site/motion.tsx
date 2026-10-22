"use client";

// The website's pictures play like short videos: each one steps through a timeline that loops while it's on screen.
// Smooth movement comes from CSS transitions between steps; numbers count with requestAnimationFrame. Visitors whose
// device asks for less motion see each picture's finished state, still.

import { MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

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
 * A looping timeline: `steps[i]` is how long step i lasts, in milliseconds. Returns the current step, how many loops
 * have played (to restart counters), and a ref for the element whose visibility runs the clock. With less motion, it
 * stays on `rest` (the last step unless given).
 */
export function useLoop(steps: readonly number[], rest = steps.length - 1) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [loops, setLoops] = useState(0);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced) return;
    const timer = setTimeout(() => {
      const next = (step + 1) % steps.length;
      if (next === 0) setLoops((l) => l + 1);
      setStep(next);
    }, steps[step]);
    return () => clearTimeout(timer);
  }, [step, visible, reduced, steps]);

  return { ref, step: reduced ? rest : step, loops, still: reduced };
}

/** Shows its children when `on`, fading and sliding them in; hides them the same way. */
export function Reveal({ on, children, className = "", from = "up", as = "div", style }: { on: boolean; children: ReactNode; className?: string; from?: "up" | "left" | "right" | "scale" | "none"; as?: "div" | "span"; style?: CSSProperties }) {
  const hidden = { up: "translate-y-2", left: "-translate-x-3", right: "translate-x-3", scale: "scale-95", none: "" }[from];
  const Tag = as;
  return (
    <Tag className={`transition-all duration-500 ease-out ${on ? "translate-x-0 translate-y-0 scale-100 opacity-100" : `pointer-events-none opacity-0 ${hidden}`} ${className}`} style={style}>
      {children}
    </Tag>
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
