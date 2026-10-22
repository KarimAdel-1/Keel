// The widgets a builder designs: a template (cards, tracker, time slots, table, summary) and where its parts come from
// in an action's response. An "Call your API" action can show its result through one.

import { WIDGET_INFO, type WidgetDefinition, type WidgetMapping, type WidgetTemplate } from "@/core/widgets";
import { db } from "@/lib/db";
import { json, newId, now } from "@/lib/rows";

type Row = { id: string; agent_id: string; template: WidgetTemplate; name: string; config: string; created_at: string; updated_at: string };

const toWidget = (r: Row): WidgetDefinition => {
  const config = json<{ mapping?: WidgetMapping; sample?: string }>(r.config, {});
  return { id: r.id, agentId: r.agent_id, template: r.template, name: r.name, mapping: config.mapping ?? {}, sample: config.sample ?? "", createdAt: r.created_at, updatedAt: r.updated_at };
};

export async function listWidgets(agentId: string): Promise<WidgetDefinition[]> {
  return ((await db().prepare("SELECT * FROM widgets WHERE agent_id = ? ORDER BY created_at").all(agentId)) as Row[]).map(toWidget);
}

export async function getWidget(id: string): Promise<WidgetDefinition | undefined> {
  const row = (await db().prepare("SELECT * FROM widgets WHERE id = ?").get(id)) as Row | undefined;
  return row ? toWidget(row) : undefined;
}

export async function saveWidget(agentId: string, input: { id?: string; template: WidgetTemplate; name?: string; mapping: WidgetMapping; sample: string }): Promise<WidgetDefinition> {
  const at = now();
  const config = JSON.stringify({ mapping: input.mapping, sample: input.sample.slice(0, 20_000) });
  if (input.id && (await getWidget(input.id))?.agentId === agentId) {
    await db().prepare("UPDATE widgets SET template = ?, name = ?, config = ?, updated_at = ? WHERE id = ?").run(input.template, input.name ?? WIDGET_INFO[input.template].name, config, at, input.id);
    return (await getWidget(input.id))!;
  }
  const id = newId("wdg");
  await db().prepare("INSERT INTO widgets (id, agent_id, template, name, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, agentId, input.template, input.name ?? WIDGET_INFO[input.template].name, config, at, at);
  return (await getWidget(id))!;
}

export async function deleteWidget(agentId: string, id: string): Promise<void> {
  await db().prepare("DELETE FROM widgets WHERE id = ? AND agent_id = ?").run(id, agentId);
}

/** Ready-made widgets: a template, a mapping and a sample response, so a builder starts from something that works. */
export const WIDGET_STARTERS: { template: WidgetTemplate; name: string; mapping: WidgetMapping; sample: unknown }[] = [
  {
    template: "cards",
    name: "Product cards",
    mapping: { items: "products", title: "name", subtitle: "description", image: "image", price: "price", link: "url" },
    sample: {
      products: [
        { name: "Stoneware mug", description: "Wheel-thrown, 350 ml", price: "$28", image: "", url: "https://example.com/mug" },
        { name: "Linen napkins", description: "Set of four", price: "$36", image: "", url: "https://example.com/napkins" },
      ],
    },
  },
  {
    template: "tracker",
    name: "Order tracker",
    mapping: { title: "order_number", steps: "stages", current: "status" },
    sample: { order_number: "Order HG-1043", stages: ["Ordered", "Packed", "Shipped", "Delivered"], status: "Shipped" },
  },
  {
    template: "slots",
    name: "Time slots",
    mapping: { items: "slots", title: "label" },
    sample: { slots: [{ label: "Tue 10:00" }, { label: "Tue 14:30" }, { label: "Wed 09:00" }] },
  },
  {
    template: "table",
    name: "Plan comparison",
    mapping: { items: "plans", columns: [{ label: "Plan", path: "name" }, { label: "Price", path: "price" }, { label: "Includes", path: "includes" }] },
    sample: { plans: [{ name: "Basic", price: "$9/mo", includes: "1 user" }, { name: "Team", price: "$29/mo", includes: "5 users" }] },
  },
  {
    template: "summary",
    name: "Booking summary",
    mapping: { title: "reference", columns: [{ label: "Date", path: "date" }, { label: "Guests", path: "guests" }, { label: "Total", path: "total" }] },
    sample: { reference: "Booking BK-2291", date: "12 Oct, 19:30", guests: 4, total: "$180" },
  },
];
