"use client";

// Pieces of Keel's own interface for the website's moving pictures, so each picture is a screen from the product: the
// dashboard's page bar, cards, pills and buttons (the same classes as the app), and the real chat window's parts
// (src/components/chat/parts.tsx), for an imaginary business, Harbor Goods.

import { CheckCircle2, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { AgentBubble, ChatFrame, InputShell, PoweredBy, SendButton, UserBubble, type ChatLook } from "../chat/parts";
import { chatVars } from "../chat/look";
import { RichText } from "../chat/RichText";
import { Pill, Spinner } from "../ui";
import { TypingDots } from "./motion";

/** Harbor Goods' chat, as its customers see it: the bold style in its blue. */
export const LOOK: ChatLook = {
  displayName: "Harbor Goods",
  color: "#44546a",
  style: "soft",
  theme: "light",
  welcome: ["Hi! Welcome to Harbor Goods. How can I help?"],
  suggestions: [],
  placeholder: "Write a message…",
  showSources: true,
};

/** A dashboard page in a window: the page bar (icon and title, actions on the right) and its content on the canvas. */
export function AppWindow({ icon, title, actions, children, className = "", bodyClassName = "p-4" }: { icon: ReactNode; title: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-bg font-sans text-text shadow-raised ${className}`}>
      <div className="flex h-12 items-center justify-between gap-3 border-b border-line bg-panel px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">{icon}</span>
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</span>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** The chat window with its message box, as on a business's website. */
export function ChatWindowShell({ children, name = LOOK.displayName, subtitle = "Usually answers in seconds", className = "" }: { children: ReactNode; name?: string; subtitle?: string; className?: string }) {
  return (
    <ChatFrame look={{ ...LOOK, displayName: name }} subtitle={subtitle} className={`rounded-2xl font-sans ${className}`}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">{children}</div>
      <div className="px-3 pb-1.5">
        <InputShell>
          <span className="flex-1 py-2 text-[14px] text-[var(--c-muted)]">{LOOK.placeholder}</span>
          <SendButton disabled />
        </InputShell>
      </div>
      <PoweredBy />
    </ChatFrame>
  );
}

/** Chat parts outside a chat window (a cropped view): they still need the window's colours. */
export function ChatColours({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div style={chatVars(LOOK)} className={`font-sans text-[var(--c-text)] ${className}`}>
      {children}
    </div>
  );
}

export function Agent({ children }: { children: ReactNode }) {
  return <AgentBubble look={LOOK}>{children}</AgentBubble>;
}

export function Customer({ children }: { children: ReactNode }) {
  return <UserBubble>{children}</UserBubble>;
}

/** The agent writing. */
export function Writing() {
  return (
    <AgentBubble look={LOOK}>
      <span className="flex h-5 items-center">
        <TypingDots className="bg-[var(--c-muted)]" />
      </span>
    </AgentBubble>
  );
}

/** An answer with its citation chip, as the chat draws it. */
export function Answer({ text }: { text: string }) {
  return (
    <AgentBubble look={LOOK}>
      <RichText text={text} onCite={() => undefined} />
    </AgentBubble>
  );
}

/** "From [1 Source]" under an answer, as the chat draws it; `opened` when its passage is showing. */
export function From({ title, opened = false }: { title: string; opened?: boolean }) {
  return (
    <div className="flex max-w-[88%] flex-wrap items-center gap-1.5 pl-1 text-xs">
      <span className="text-[var(--c-muted)]">From</span>
      <span className={`inline-flex max-w-[240px] items-center gap-1 rounded-md border bg-[var(--c-chip-bg)] px-1.5 py-0.5 transition-colors ${opened ? "border-[var(--c-accent)]" : "border-[var(--c-line)]"}`}>
        <span className="font-semibold text-[var(--c-muted)]">1</span>
        <span className="truncate">{title}</span>
      </span>
    </div>
  );
}

/** The note the chat shows once the team has the conversation. */
export function TeamNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-[var(--c-line)] px-3 py-2 text-center text-xs text-[var(--c-muted)]">{children}</p>;
}

/** A test's latest result, as the Tests page shows it. */
export function Result({ state, score }: { state: "waiting" | "running" | "passed" | "failed"; score?: number }) {
  if (state === "waiting" || state === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <Spinner className="size-3.5" /> {state === "waiting" ? "Waiting" : "Running"}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${state === "passed" ? "text-good" : "text-bad"}`}>
      {state === "passed" ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {state === "passed" ? "Passed" : "Failed"} {score !== undefined && <span className="font-normal text-muted">· {score}</span>}
    </span>
  );
}

/** A progress bar, as the dashboard draws it: fills to `to` percent over `ms`. */
export function Progress({ to, ms = 1500 }: { to: number; ms?: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
      <div className={`h-full rounded-full bg-brand ${to ? "transition-[width] ease-out" : "transition-none"}`} style={{ width: `${to}%`, transitionDuration: to ? `${ms}ms` : "0ms" }} />
    </div>
  );
}

/** A knowledge source's state, as the Knowledge page shows it. */
export function SourceState({ state }: { state: "waiting" | "learning" | "ready" }) {
  if (state === "ready") return <Pill tone="good">Ready</Pill>;
  if (state === "learning")
    return (
      <Pill tone="brand">
        <Spinner className="size-3" /> Learning
      </Pill>
    );
  return <Pill>Waiting</Pill>;
}
