// The colours of a chat window for each style and theme, as CSS variables on the window, so one set of components
// draws every look. Everything is derived from the business's single accent colour.

import type { CSSProperties } from "react";
import { inkFor, type AgentAppearance, type ChatStyle } from "@/core/agents";

/** What the chat window needs to know to look right. */
export type ChatLook = Pick<AgentAppearance, "displayName" | "color" | "welcome" | "suggestions" | "placeholder" | "theme" | "style" | "showSources" | "avatar">;

export const lookOf = (a: AgentAppearance): ChatLook => ({
  displayName: a.displayName,
  color: a.color,
  welcome: a.welcome,
  suggestions: a.suggestions,
  placeholder: a.placeholder,
  theme: a.theme,
  style: a.style,
  showSources: a.showSources,
  ...(a.avatar ? { avatar: a.avatar } : {}),
});

const mix = (color: string, percent: number, base: string) => `color-mix(in srgb, ${color} ${percent}%, ${base})`;

export function chatVars(look: Pick<ChatLook, "color" | "theme" | "style">): CSSProperties {
  const dark = look.theme === "dark";
  const accent = look.color;
  const ink = inkFor(accent);
  const surface = dark ? "#15171c" : "#ffffff";
  const raised = dark ? "#23262e" : "#f2f3f5";
  const text = dark ? "#eceef2" : "#111318";
  const muted = dark ? "#9aa0ab" : "#646a75";
  const line = dark ? "#2c3038" : "#e6e8ec";
  const style: ChatStyle = look.style;

  const bg = style === "soft" ? mix(accent, dark ? 14 : 7, surface) : surface;
  const coloured = style === "bold";
  const vars: Record<string, string> = {
    "--c-bg": bg,
    "--c-text": text,
    "--c-muted": muted,
    "--c-line": style === "soft" ? mix(accent, 14, surface) : line,
    "--c-accent": accent,
    "--c-accent-ink": ink,
    "--c-header-bg": coloured ? accent : style === "classic" ? (dark ? "#191b21" : "#fafafb") : bg,
    "--c-header-text": coloured ? ink : text,
    "--c-header-muted": coloured ? (ink === "#ffffff" ? "rgb(255 255 255 / 0.75)" : "rgb(0 0 0 / 0.6)") : muted,
    "--c-agent-bg": style === "minimal" ? "transparent" : style === "soft" ? (dark ? "#1e2128" : "#ffffff") : raised,
    "--c-user-bg": style === "minimal" ? raised : accent,
    "--c-user-text": style === "minimal" ? text : ink,
    "--c-chip-bg": style === "soft" ? (dark ? "#1e2128" : "#ffffff") : surface,
    "--c-input-bg": style === "soft" ? (dark ? "#1e2128" : "#ffffff") : surface,
    "--c-input-line": dark ? "#4a4f59" : style === "classic" ? "#2b2d31" : line,
    "--c-radius": style === "soft" ? "22px" : style === "minimal" ? "12px" : "18px",
  };
  return vars as CSSProperties;
}
