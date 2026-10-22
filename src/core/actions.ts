// Actions: what an agent can do besides answering. Each is a tool the model may call, with a name, a sentence saying
// when to use it, and its own settings. Pure types and defaults; running them is src/platform/actions.ts.

import type { FieldSpec } from "./widgets";

export const ACTION_KINDS = ["escalate", "handoff", "api", "lead", "data", "form", "button", "followups"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface ApiParam {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface ActionConfigs {
  /** Opens a ticket for the team, with the agent's summary. */
  escalate: { confirmation: string };
  /** A person from the team takes over the conversation. */
  handoff: { message: string };
  /** Calls the business's own system. `{name}` in the URL is filled from the parameters. */
  api: { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; headers: { name: string; value: string }[]; params: ApiParam[]; widgetId?: string };
  /** Shows a form for the visitor's contact details; each lead becomes a contact. */
  lead: { title: string; fields: ("name" | "email" | "phone" | "company")[]; submitLabel: string };
  /** Shows a form for details the business needs, such as an order number. */
  data: { title: string; fields: FieldSpec[]; submitLabel: string };
  /** Shows a form of the builder's own design. */
  form: { title: string; fields: FieldSpec[]; submitLabel: string };
  /** Shows a button that opens a link. */
  button: { label: string; url: string };
  /** After each answer, offers up to `count` questions the visitor might ask next. Not a tool. */
  followups: { count: number };
}

export interface Action<K extends ActionKind = ActionKind> {
  id: string;
  agentId: string;
  kind: K;
  /** The tool's name, in snake_case: how the model and procedures refer to it. */
  name: string;
  title: string;
  /** When the agent should use it, in a sentence. */
  description: string;
  config: ActionConfigs[K];
  enabled: boolean;
  /** Only offered while a procedure that mentions it is running. */
  proceduresOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export const ACTION_INFO: Record<ActionKind, { title: string; text: string; group: string; name: string; description: string }> = {
  escalate: {
    title: "Create a ticket",
    text: "When a customer needs a person, the agent opens a ticket for your team with a summary of the conversation.",
    group: "Hand over to your team",
    name: "create_ticket",
    description: "Use when the customer needs help the agent can't give itself, or asks for a person and no one is available to chat.",
  },
  handoff: {
    title: "Live handover",
    text: "A person from your team takes over the chat from the Helpdesk inbox; the agent steps back.",
    group: "Hand over to your team",
    name: "hand_over_to_person",
    description: "Use when the customer asks to talk to a person, or is upset and the agent can't resolve it.",
  },
  api: {
    title: "Call your API",
    text: "The agent calls your own system (look up an order, check stock, book a slot) and answers with what it returns. Can show the result as a widget.",
    group: "Connect your systems",
    name: "look_up_order",
    description: "Use when the customer asks about a specific order and gives its number.",
  },
  lead: {
    title: "Collect leads",
    text: "A short form for name, email and phone when someone is interested; every lead lands in Leads and Contacts.",
    group: "Collect details",
    name: "collect_lead",
    description: "Use when the visitor shows interest in buying, a demo or a quote, or wants to be contacted.",
  },
  data: {
    title: "Collect data",
    text: "A form for the details you need to help: an order number, a booking date, an account email.",
    group: "Collect details",
    name: "collect_details",
    description: "Use when you need specific details from the customer before you can help.",
  },
  form: {
    title: "Custom form",
    text: "Any form you design, shown in the chat: a return request, a booking request, a survey.",
    group: "Collect details",
    name: "show_request_form",
    description: "Use when the customer wants to make a request this form is for.",
  },
  button: {
    title: "Link button",
    text: "A button that opens one of your pages: checkout, booking, a sign-up page.",
    group: "In the chat",
    name: "show_link_button",
    description: "Use when the customer is ready for the next step on your website.",
  },
  followups: {
    title: "Suggested next questions",
    text: "After each answer, the chat offers a few questions the visitor might ask next, as one-tap buttons.",
    group: "In the chat",
    name: "suggest_followups",
    description: "Offer follow-up questions after each answer.",
  },
};

export const DEFAULT_ACTION_CONFIG: { [K in ActionKind]: ActionConfigs[K] } = {
  escalate: { confirmation: "I've passed this to our team, and someone will get back to you soon." },
  handoff: { message: "I'm bringing in someone from our team. They'll reply here shortly." },
  api: { method: "GET", url: "https://", headers: [], params: [{ name: "order_number", type: "string", description: "The order number the customer gave", required: true }] },
  lead: { title: "Leave your details and we'll be in touch", fields: ["name", "email"], submitLabel: "Send" },
  data: { title: "A few details, please", fields: [{ key: "order_number", label: "Order number", type: "text", required: true }], submitLabel: "Send" },
  form: {
    title: "Request form",
    fields: [
      { key: "name", label: "Your name", type: "text", required: true },
      { key: "details", label: "What do you need?", type: "long", required: true },
    ],
    submitLabel: "Send request",
  },
  button: { label: "Open", url: "https://" },
  followups: { count: 3 },
};

/** Field specs for the lead form's chosen fields. */
export const LEAD_FIELDS: Record<"name" | "email" | "phone" | "company", FieldSpec> = {
  name: { key: "name", label: "Name", type: "text", required: true },
  email: { key: "email", label: "Email", type: "email", required: true },
  phone: { key: "phone", label: "Phone", type: "phone", required: false },
  company: { key: "company", label: "Company", type: "text", required: false },
};

/** A tool name as the model needs it: lowercase letters, digits and underscores. */
export const toolName = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "action";
