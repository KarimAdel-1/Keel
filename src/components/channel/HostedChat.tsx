"use client";

import { useState } from "react";
import type { ChatLayout } from "@/core/agents";
import { ChatWindow } from "../chat/ChatWindow";
import type { ChatLook } from "../chat/look";

/** A random id this browser keeps, so one visitor's messages can be counted without knowing who they are. */
function visitorId(): string | undefined {
  try {
    let id = localStorage.getItem("keel-visitor");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("keel-visitor", id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/**
 * The public chat. On its own it's the full chat page; inside a business's site (`embed`) it fills the frame the
 * embed script made, and its close button asks that page to close the frame.
 */
export function HostedChat({ agentId, look, embed }: { agentId: string; look: ChatLook; embed?: Exclude<ChatLayout, "page"> }) {
  const [visitor] = useState(() => (typeof window === "undefined" ? undefined : visitorId()));
  const [host] = useState(() => {
    try {
      return typeof document === "undefined" || !document.referrer ? undefined : new URL(document.referrer).hostname;
    } catch {
      return undefined;
    }
  });
  const extra = { channel: embed ? "widget" : "share", layout: embed ?? "page", visitor, host };
  const close = embed === "bubble" || embed === "panel" || embed === "focus" ? () => window.parent.postMessage({ keel: "close", agent: agentId }, "*") : undefined;
  const dark = look.theme === "dark";

  if (embed) {
    return <ChatWindow agentId={agentId} look={look} endpoint={`/api/chat/${agentId}`} extra={extra} remember={{ visitor }} subtitle="Usually answers in seconds" onClose={close} className="h-dvh rounded-none border-0 shadow-none" />;
  }
  return (
    <div className="flex h-dvh flex-col" style={{ background: dark ? "#0d0f13" : "#f4f5f7" }}>
      <div className="flex min-h-0 flex-1 justify-center sm:p-6">
        <ChatWindow agentId={agentId} look={look} endpoint={`/api/chat/${agentId}`} extra={extra} remember={{ visitor }} subtitle="Usually answers in seconds" className="h-full w-full max-w-[720px] rounded-none border-0 sm:rounded-2xl sm:border" />
      </div>
    </div>
  );
}
