import { ArrowUp, RotateCw, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { inkFor } from "@/core/agents";
import { chatVars, type ChatLook } from "./look";

export type { ChatLook } from "./look";

function Avatar({ look, size = 32, onHeader = false }: { look: Pick<ChatLook, "displayName" | "color" | "style" | "avatar">; size?: number; onHeader?: boolean }) {
  if (look.avatar) {
    // An inline image the builder chose (their logo): never loaded from elsewhere.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={look.avatar} alt="" aria-hidden className="shrink-0 rounded-full bg-white object-contain p-[2px] ring-1 ring-black/10" style={{ width: size, height: size }} />;
  }
  const inverted = onHeader && look.style === "bold";
  const bg = inverted ? "rgb(255 255 255 / 0.18)" : look.color;
  const fg = inverted ? "var(--c-header-text)" : inkFor(look.color);
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.42) }}>
      {(look.displayName.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** The chat window: its colours, header and frame. The body and message box go inside. */
export function ChatFrame({
  look,
  subtitle,
  onRestart,
  onClose,
  children,
  className = "",
  colours,
}: {
  look: ChatLook;
  subtitle?: string;
  /** Shown as the restart icon in the header, once there's a conversation to restart. */
  onRestart?: () => void;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
  /** Colours that stand in for the look's own (the website's pictures of the chat). */
  colours?: CSSProperties;
}) {
  return (
    <section
      style={{ ...chatVars(look), ...colours }}
      className={`flex min-h-0 flex-col overflow-hidden border border-[var(--c-line)] bg-[var(--c-bg)] text-[var(--c-text)] shadow-raised ${className}`}
      data-style={look.style}
      data-theme={look.theme}
    >
      <header className={`flex items-center gap-3 bg-[var(--c-header-bg)] px-5 py-3.5 text-[var(--c-header-text)] ${look.style === "bold" ? "" : "border-b border-[var(--c-line)]"}`}>
        <Avatar look={look} onHeader />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{look.displayName || "Your agent"}</p>
          {subtitle && <p className="truncate text-xs text-[var(--c-header-muted)]">{subtitle}</p>}
        </div>
        {onRestart && (
          <button type="button" onClick={onRestart} className="rounded-md p-1.5 opacity-70 transition hover:bg-black/5 hover:opacity-100" title="Start a new chat" aria-label="Start a new chat">
            <RotateCw className="size-[18px]" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-md p-1.5 opacity-70 transition hover:bg-black/5 hover:opacity-100" title="Close" aria-label="Close the chat">
            <X className="size-[18px]" />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

export function AgentBubble({ look, children }: { look: ChatLook; children: ReactNode }) {
  if (look.style === "minimal") {
    return (
      <div className="flex max-w-[92%] gap-2.5">
        <Avatar look={look} size={22} />
        <div className="min-w-0 pt-px text-[14px] leading-relaxed [overflow-wrap:anywhere]">{children}</div>
      </div>
    );
  }
  return (
    <div className={`w-fit max-w-[88%] bg-[var(--c-agent-bg)] px-4 py-2.5 text-[14px] leading-relaxed [overflow-wrap:anywhere] ${look.style === "soft" ? "shadow-sm" : ""}`} style={{ borderRadius: "var(--c-radius)" }}>
      {children}
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap bg-[var(--c-user-bg)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--c-user-text)]" style={{ borderRadius: "var(--c-radius)" }}>
      {children}
    </div>
  );
}

/** One-tap questions, stacked on the right like a visitor's own messages would be. */
export function SuggestionChips({ suggestions, onPick, disabled }: { suggestions: string[]; onPick?: (s: string) => void; disabled?: boolean }) {
  if (!suggestions.length) return null;
  return (
    <div className="flex flex-col items-end gap-2">
      {suggestions.map((s) => (
        <button
          key={s}
          type="button"
          disabled={disabled || !onPick}
          onClick={() => onPick?.(s)}
          className="rounded-full border border-[var(--c-line)] bg-[var(--c-chip-bg)] px-4 py-2 text-left text-[13px] font-medium text-[var(--c-text)] transition hover:border-[var(--c-accent)] disabled:cursor-default"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function PoweredBy() {
  return (
    <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-[var(--c-muted)]">
      <span className="inline-flex size-3.5 items-center justify-center rounded-[4px] bg-[var(--c-muted)] text-[8px] font-bold text-[var(--c-bg)]">k</span>
      Powered by Keel
    </p>
  );
}

/** The message box's frame: a rounded field with the send button inside it. */
export function InputShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-end gap-2 rounded-[26px] border-[1.5px] border-[var(--c-input-line)] bg-[var(--c-input-bg)] py-1.5 pl-4 pr-1.5 transition focus-within:border-[var(--c-accent)]">
      {children}
    </div>
  );
}

export function SendButton({ disabled, title = "Send" }: { disabled?: boolean; title?: string }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--c-accent)] text-[var(--c-accent-ink)] transition disabled:bg-[var(--c-line)] disabled:text-[var(--c-muted)]"
      title={title}
      aria-label={title}
    >
      <ArrowUp className="size-4" />
    </button>
  );
}

