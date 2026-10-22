"use client";

import { BellOff, BellRing } from "lucide-react";
import { useState } from "react";

/**
 * Notifications in this browser, for a customer who needs a person: a switch where the team waits for customers (the
 * Helpdesk, Home, Workspace settings), never a card over the page.
 */
export function BrowserAlerts() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  if (permission === "unsupported") return null;
  if (permission === "granted") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <BellRing className="size-3.5 text-good" /> Notifications are on in this browser
      </span>
    );
  }
  if (permission === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted" title="Allow notifications for this site in your browser's settings">
        <BellOff className="size-3.5" /> Notifications are blocked in this browser
      </span>
    );
  }
  return (
    <button type="button" onClick={() => void Notification.requestPermission().then(setPermission)} className="btn btn-secondary px-2.5 py-1.5 text-xs">
      <BellRing className="size-3.5" /> Notify me in this browser
    </button>
  );
}
