// Harbor Goods' orders, made up for the demo business (scripts/demo/harbor-goods.ts): Keel's own stand-in for a shop's
// order system, so the demo's "Look up an order" action and its order tracker work without a real one. It's served at
// /api/demo/orders/<number> like any shop's API, and answered in the same process when an agent calls it: a server
// can't always reach its own public address from inside its network. The dates move with today, so it never looks old.

import { setting } from "@/lib/settings";

export const DEMO_ORDER_PATH = "/api/demo/orders/";
const STEPS = ["Ordered", "Packed", "Shipped", "Delivered"];

/** Each order: what's in it, how far it's got (a step in STEPS), and its days, counted from today. */
const ORDERS: Record<string, { items: string[]; step: number; placedDaysAgo: number; deliveryInDays: number; method: string }> = {
  "HG-1043": { items: ["Set of four Harbour mugs, Sea Glass"], step: 2, placedDaysAgo: 3, deliveryInDays: 2, method: "UK standard delivery" },
  "HG-1051": { items: ["Dinner plate, 27 cm, Slate (4)"], step: 1, placedDaysAgo: 1, deliveryInDays: 4, method: "UK standard delivery" },
  "HG-1038": { items: ["Napkins, set of four, Sage", "Tea towel, Natural"], step: 3, placedDaysAgo: 8, deliveryInDays: -3, method: "UK standard delivery" },
  "HG-1060": { items: ["Serving bowl, 28 cm, Driftwood"], step: 0, placedDaysAgo: 0, deliveryInDays: 16, method: "UK standard delivery (serving bowls are made to order)" },
};

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

/** The order, as Harbor Goods' system would answer: 200 with its details, or 404. */
export function demoOrder(number: string): { status: number; body: unknown } {
  const key = number.trim().toUpperCase().replace(/^HG\s*-?\s*/, "HG-");
  const o = ORDERS[key];
  if (!o) return { status: 404, body: { error: `There's no order ${number.trim()}. Order numbers look like HG-1043.` } };
  return {
    status: 200,
    body: {
      title: `Order ${key}`,
      order_number: key,
      status: STEPS[o.step],
      delivered: o.step === 3,
      // Every step an order goes through, for the order tracker; `status` is where this one is.
      steps: STEPS,
      items: o.items,
      placed_on: day(-o.placedDaysAgo),
      delivery: o.step === 3 ? `Delivered on ${day(o.deliveryInDays)}` : `Expected on ${day(o.deliveryInDays)}`,
      delivery_method: o.method,
    },
  };
}

/**
 * The demo order system's answer when an action calls this server's own demo address (on KEEL_PUBLIC_URL, or on this
 * machine), without going out to the network; undefined for any other address.
 */
export function ownDemoOrder(url: string): { status: number; body: unknown } | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!u.pathname.startsWith(DEMO_ORDER_PATH)) return undefined;
  const configured = setting("KEEL_PUBLIC_URL");
  const own = (configured && new URL(configured).host === u.host) || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.host);
  return own ? demoOrder(decodeURIComponent(u.pathname.slice(DEMO_ORDER_PATH.length))) : undefined;
}
