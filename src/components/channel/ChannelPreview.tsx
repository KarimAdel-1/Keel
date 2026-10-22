"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { inkFor, type ChatLayout } from "@/core/agents";
import { ChatWindow } from "../chat/ChatWindow";
import type { ChatLook } from "../chat/look";

/** A stand-in website: the business's name in its header, grey blocks for its content. */
function SitePreview({ name, compact }: { name: string; compact: boolean }) {
  return (
    <div className="h-full bg-white">
      <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-3.5">
        <span className="text-sm font-semibold text-[#111318]">{name}</span>
        {!compact && (
          <span className="flex gap-4">
            {[44, 52, 38, 46].map((w, i) => (
              <span key={i} className="h-2 rounded bg-[#e7e9ee]" style={{ width: w }} />
            ))}
          </span>
        )}
      </div>
      <div className="px-5 py-8">
        <div className="h-5 w-3/4 rounded bg-[#e3e6eb]" />
        <div className="mt-2.5 h-5 w-1/2 rounded bg-[#e3e6eb]" />
        <div className="mt-5 space-y-2">
          <div className="h-2.5 w-full rounded bg-[#eef0f3]" />
          <div className="h-2.5 w-11/12 rounded bg-[#eef0f3]" />
          <div className="h-2.5 w-4/5 rounded bg-[#eef0f3]" />
        </div>
        <div className="mt-6 h-9 w-32 rounded-full bg-[#111318]/85" />
        <div className={`mt-10 grid gap-4 ${compact ? "grid-cols-1" : "grid-cols-3"}`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-[#eef0f3] p-4">
              <div className="h-20 rounded-lg bg-[#f2f4f7]" />
              <div className="mt-3 h-2.5 w-2/3 rounded bg-[#e7e9ee]" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-[#eef0f3]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The chat on a sample website, in the chosen layout, on a desktop or a phone. The chat is live: it answers through
 * the builder's test chat, with any unsaved settings.
 */
export function ChannelPreview({
  agentId,
  businessName,
  look,
  layout,
  position,
  device,
  extra,
  pageUrl,
}: {
  agentId: string;
  businessName: string;
  look: ChatLook;
  layout: ChatLayout;
  position: "right" | "left";
  device: "desktop" | "mobile";
  extra?: Record<string, unknown>;
  /** Where the full-page chat lives, to show in the address bar. */
  pageUrl: string;
}) {
  const [open, setOpen] = useState(true);
  const mobile = device === "mobile";
  const side = position === "left" ? "left-4" : "right-4";
  const endpoint = `/api/agents/${agentId}/chat`;
  const host = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbusiness"}.com`;
  const chat = (className: string, onClose?: () => void) => (
    <ChatWindow agentId={agentId} look={look} endpoint={endpoint} extra={extra} subtitle="Usually answers in seconds" onClose={onClose} className={className} />
  );

  let stage;
  if (layout === "page") {
    stage = (
      <div className="flex h-full flex-col" style={{ background: look.theme === "dark" ? "#0d0f13" : "#f4f5f7" }}>
        <div className={`flex flex-1 justify-center ${mobile ? "" : "p-6"}`}>
          {chat(mobile ? "h-full w-full rounded-none border-0" : "h-full w-full max-w-[680px] rounded-2xl")}
        </div>
        <p className="py-2 text-center text-[11px]" style={{ color: look.theme === "dark" ? "#7d8390" : "#8d939e" }}>Powered by Keel</p>
      </div>
    );
  } else if (layout === "inline") {
    stage = (
      <div className="h-full overflow-y-auto bg-white">
        <div className="flex items-center justify-between border-b border-[#eef0f3] px-5 py-3.5">
          <span className="text-sm font-semibold text-[#111318]">{businessName}</span>
          <span className="text-xs text-[#8d939e]">Help centre</span>
        </div>
        <div className="mx-auto max-w-[640px] px-5 py-6">
          <p className="text-lg font-semibold text-[#111318]">How can we help?</p>
          <div className="mt-2 h-2.5 w-3/4 rounded bg-[#eef0f3]" />
          <div className="mt-5">{chat("h-[440px] rounded-2xl")}</div>
          <div className="mt-6 space-y-2">
            <div className="h-2.5 w-full rounded bg-[#eef0f3]" />
            <div className="h-2.5 w-5/6 rounded bg-[#eef0f3]" />
          </div>
        </div>
      </div>
    );
  } else if (layout === "focus") {
    stage = (
      <div className="relative h-full overflow-hidden">
        <SitePreview name={businessName} compact={mobile} />
        {open ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
            <div className={mobile ? "h-full w-full" : "h-[86%] w-full max-w-[600px]"}>{chat(mobile ? "h-full rounded-2xl" : "h-full rounded-2xl", () => setOpen(false))}</div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`absolute bottom-4 ${side} rounded-full px-5 py-3 text-sm font-semibold shadow-raised`}
            style={{ background: look.color, color: inkFor(look.color) }}
          >
            Ask a question
          </button>
        )}
      </div>
    );
  } else if (layout === "panel") {
    stage = (
      <div className="relative h-full overflow-hidden">
        <SitePreview name={businessName} compact={mobile} />
        {open ? (
          <div className={`absolute inset-y-0 ${position === "left" ? "left-0" : "right-0"} ${mobile ? "w-full" : "w-[380px]"} shadow-raised`}>
            {chat("h-full rounded-none border-y-0", () => setOpen(false))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`absolute top-1/2 ${position === "left" ? "left-0 rounded-r-lg" : "right-0 rounded-l-lg"} -translate-y-1/2 px-2 py-4 text-xs font-semibold shadow-raised [writing-mode:vertical-rl]`}
            style={{ background: look.color, color: inkFor(look.color) }}
          >
            Chat with us
          </button>
        )}
      </div>
    );
  } else {
    stage = (
      <div className="relative h-full overflow-hidden">
        <SitePreview name={businessName} compact={mobile} />
        {open && (mobile ? <div className="absolute inset-0">{chat("h-full rounded-none border-0", () => setOpen(false))}</div> : <div className={`absolute bottom-[88px] ${side} h-[min(540px,calc(100%-7rem))] w-[370px]`}>{chat("h-full rounded-2xl", () => setOpen(false))}</div>)}
        {!(open && mobile) && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className={`absolute bottom-4 ${side} inline-flex size-14 items-center justify-center rounded-full shadow-raised transition hover:scale-105`}
            style={{ background: look.color, color: inkFor(look.color) }}
            aria-label={open ? "Close the chat" : "Open the chat"}
          >
            <MessageCircle className="size-6" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`mx-auto overflow-hidden border border-line-strong bg-panel shadow-raised ${mobile ? "w-[390px] max-w-full rounded-[28px]" : "w-full rounded-xl"}`}>
      <div className="flex h-9 items-center gap-2 border-b border-line bg-panel-2 px-3">
        <span className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="size-2.5 rounded-full" style={{ background: c }} />
          ))}
        </span>
        <span className="mx-auto truncate rounded-md bg-panel px-3 py-0.5 text-[11px] text-muted">{layout === "page" ? pageUrl.replace(/^https?:\/\//, "") : host}</span>
      </div>
      <div className={mobile ? "h-[700px]" : "h-[640px]"}>{stage}</div>
    </div>
  );
}
