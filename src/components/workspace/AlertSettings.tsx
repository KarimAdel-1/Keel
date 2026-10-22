"use client";

import { useState } from "react";
import { BrowserAlertsLoader } from "../shell/BrowserAlertsLoader";
import { Toggle } from "../ui";

/** Your own alerts: an email when a customer needs a person. Each person chooses for themselves. */
export function AlertSettings({ initial, canEmail, email }: { initial: boolean; canEmail: boolean; email: string }) {
  const [on, setOn] = useState(initial);
  async function change(next: boolean) {
    setOn(next);
    await fetch("/api/account/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emailAlerts: next }) }).catch(() => setOn(!next));
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Email me when a customer needs a person</p>
          <p className="mt-0.5 text-muted">
            To {email}, with the conversation and a link to answer from the Helpdesk.
            {!canEmail && " This server can't send email yet: ask the person who runs Keel to set SMTP_URL."}
          </p>
        </div>
        <Toggle checked={on} onChange={(v) => void change(v)} label="Email alerts" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">While Keel is open in a tab, you also hear a sound and see a notification. To reach your whole team where it works, connect Slack in Put it live › Messaging apps and tools.</p>
        <BrowserAlertsLoader />
      </div>
    </div>
  );
}
