// Rich replies: what an agent can show in the chat besides text. Forms collect details, buttons link out, and the
// templates show data from the business's own systems (an action's response) as cards, a tracker, time slots, a
// comparison table or a short summary. Pure: drawn by src/components/chat/ChatWidget.tsx.

/** A field in a form the agent shows. */
export interface FieldSpec {
  key: string;
  label: string;
  type: "text" | "long" | "email" | "phone" | "number" | "date" | "choice";
  required: boolean;
  options?: string[];
}

export const WIDGET_TEMPLATES = ["cards", "tracker", "slots", "table", "summary"] as const;
export type WidgetTemplate = (typeof WIDGET_TEMPLATES)[number];

export const WIDGET_INFO: Record<WidgetTemplate, { name: string; text: string; example: string }> = {
  cards: { name: "Product cards", text: "A row of cards with a picture, a name, a price and a link: products, rooms, plans or classes.", example: "Show products that match what the customer wants" },
  tracker: { name: "Order tracker", text: "Where something is now, step by step: an order, a booking, a request.", example: "Show where an order is" },
  slots: { name: "Time slots", text: "Times to choose from; tapping one sends it as the customer's answer.", example: "Offer appointment or class times" },
  table: { name: "Comparison table", text: "Rows and columns: plans side by side, opening hours, fees.", example: "Compare plans or prices" },
  summary: { name: "Summary card", text: "A title and a few labelled values: an account balance, a booking, an invoice.", example: "Show an account or booking summary" },
};

/**
 * Where each part of a template comes from in an action's response, as dot paths ("data.items", "price.amount").
 * `items` is the list to show; the other paths are read from each item (or from the response, for `summary`).
 */
export interface WidgetMapping {
  items?: string;
  title?: string;
  subtitle?: string;
  image?: string;
  price?: string;
  link?: string;
  /** tracker: the steps' names (a list) and the current step (a name or a number). */
  steps?: string;
  current?: string;
  /** table and summary: which fields to show, with their labels. */
  columns?: { label: string; path: string }[];
}

export interface WidgetDefinition {
  id: string;
  agentId: string;
  template: WidgetTemplate;
  name: string;
  mapping: WidgetMapping;
  /** An example response, to preview the widget while building it. */
  sample: string;
  createdAt: string;
  updatedAt: string;
}

/** What the chat draws. */
export type ChatWidget =
  | { type: "form"; actionId: string; kind: "lead" | "data" | "form"; title: string; fields: FieldSpec[]; submitLabel: string }
  | { type: "button"; label: string; url: string }
  | { type: "cards"; items: { title: string; subtitle?: string; image?: string; price?: string; link?: string }[] }
  | { type: "tracker"; title?: string; steps: string[]; current: number }
  | { type: "slots"; title?: string; options: string[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "summary"; title?: string; rows: { label: string; value: string }[] };

/** A value at a dot path ("a.b.0.c"), or undefined. */
export function pick(value: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let at: unknown = value;
  for (const part of path.split(".").filter(Boolean)) {
    if (at === null || at === undefined) return undefined;
    at = Array.isArray(at) && /^\d+$/.test(part) ? at[Number(part)] : (at as Record<string, unknown>)[part];
  }
  return at;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** An action's response drawn as a widget, through its mapping. Undefined when the response has nothing to show. */
export function renderWidget(def: Pick<WidgetDefinition, "template" | "mapping">, response: unknown): ChatWidget | undefined {
  const m = def.mapping;
  const listAt = m.items ? pick(response, m.items) : response;
  const list = Array.isArray(listAt) ? listAt.slice(0, 12) : listAt && typeof listAt === "object" ? [listAt] : [];
  switch (def.template) {
    case "cards": {
      const items = list.map((item) => ({
        title: text(pick(item, m.title)) || "Item",
        ...(m.subtitle ? { subtitle: text(pick(item, m.subtitle)) } : {}),
        ...(m.image && /^https:\/\//.test(text(pick(item, m.image))) ? { image: text(pick(item, m.image)) } : {}),
        ...(m.price ? { price: text(pick(item, m.price)) } : {}),
        ...(m.link && /^https?:\/\//.test(text(pick(item, m.link))) ? { link: text(pick(item, m.link)) } : {}),
      }));
      return items.length ? { type: "cards", items } : undefined;
    }
    case "tracker": {
      const stepsAt = pick(response, m.steps);
      const steps = Array.isArray(stepsAt) ? stepsAt.map(text).filter(Boolean) : [];
      if (!steps.length) return undefined;
      const currentAt = pick(response, m.current);
      const current = typeof currentAt === "number" ? currentAt : Math.max(0, steps.findIndex((s) => s.toLowerCase() === text(currentAt).toLowerCase()));
      return { type: "tracker", ...(m.title ? { title: text(pick(response, m.title)) } : {}), steps, current: Math.min(current, steps.length - 1) };
    }
    case "slots": {
      const options = list.map((item) => text(m.title ? pick(item, m.title) : item)).filter(Boolean).slice(0, 8);
      return options.length ? { type: "slots", options } : undefined;
    }
    case "table": {
      const columns = m.columns?.length ? m.columns : [];
      if (!columns.length || !list.length) return undefined;
      return { type: "table", columns: columns.map((c) => c.label), rows: list.map((item) => columns.map((c) => text(pick(item, c.path)))) };
    }
    case "summary": {
      const rows = (m.columns ?? []).map((c) => ({ label: c.label, value: text(pick(response, c.path)) })).filter((r) => r.value);
      return rows.length ? { type: "summary", ...(m.title ? { title: text(pick(response, m.title)) } : {}), rows } : undefined;
    }
  }
}
