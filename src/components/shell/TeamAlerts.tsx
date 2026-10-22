"use client";

import { BellRing, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Alert = { id: string; subject: string; agentName: string; status: "new" | "open"; updatedAt: string };

const POLL_MS = 12_000;
const SEEN_KEY = "keel-alerts-seen";


/** A short two-note chime, made in the browser: no sound file to load. */
function chime() {
  try {
    const ctx = new AudioContext();
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.4);
    }
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // No sound where the browser won't play one (before the first click on the page).
  }
}

/**
 * While the dashboard is open: when a customer needs a person, a sound, a browser notification (once allowed, with the
 * switch in BrowserAlerts.tsx) and a card in the corner that opens the ticket. Email and Slack alerts reach the team when it's closed (src/platform/alerts.ts).
 */
export function TeamAlerts() {
  const router = useRouter();
  const [shown, setShown] = useState<Alert[]>([]);
  // Read once on the client: before that (and where the browser has no notifications) nothing is asked.
  const since = useRef<string>("");

  useEffect(() => {
    try {
      since.current = localStorage.getItem(SEEN_KEY) ?? new Date().toISOString();
    } catch {
      since.current = new Date().toISOString();
    }
    const check = async () => {
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission !== "granted") return;
      const res = await fetch(`/api/workspace/alerts?since=${encodeURIComponent(since.current)}`, { cache: "no-store" }).catch(() => undefined);
      if (!res?.ok) return;
      const { alerts } = (await res.json()) as { alerts: Alert[] };
      if (!alerts.length) return;
      since.current = alerts[0].updatedAt;
      try {
        localStorage.setItem(SEEN_KEY, since.current);
      } catch {}
      chime();
      setShown((s) => [...alerts.filter((a) => !s.some((x) => x.id === a.id)), ...s].slice(0, 3));
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const a of alerts.slice(0, 3)) {
          const n = new Notification(a.status === "new" ? "A customer needs your team" : "A customer replied", { body: `${a.agentName}: ${a.subject}`, tag: a.id });
          n.onclick = () => {
            window.focus();
            router.push(`/app/helpdesk?t=${a.id}`);
          };
        }
      }
    };
    const timer = setInterval(() => void check(), POLL_MS);
    void check();
    return () => clearInterval(timer);
  }, [router]);

  return (
    // Top right, under the page's title bar: clear of every chat's message box and the Helpdesk's reply box.
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {shown.map((a) => (
        <div key={a.id} className="pointer-events-auto card flex items-start gap-3 border-brand/40 p-3 shadow-raised">
          <BellRing className="mt-0.5 size-4 shrink-0 text-brand" />
          <Link href={`/app/helpdesk?t=${a.id}`} onClick={() => setShown((s) => s.filter((x) => x.id !== a.id))} className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{a.status === "new" ? "A customer needs your team" : "A customer replied"}</p>
            <p className="truncate text-xs text-muted">
              {a.agentName}: {a.subject}
            </p>
          </Link>
          <button type="button" onClick={() => setShown((s) => s.filter((x) => x.id !== a.id))} className="rounded p-1 text-muted hover:bg-panel-2" title="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
