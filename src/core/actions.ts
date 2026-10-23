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

/** A form's fields as the agent describes them to the visitor: "Name, Email, Phone (optional)". */
export const fieldList = (fields: FieldSpec[]) => fields.map((f) => `${f.label}${f.required ? "" : " (optional)"}`).join(", ");

/**
 * Whether a reply tells the visitor a form is in the chat: "fill in the form below", "I'll show you a quick form", "the
 * form is now on your screen". A form on a website ("the contact form on our site") doesn't count.
 */
export function promisesForm(text: string): boolean {
  const said = straightQuotes(text);
  return [
    /\bform (?:below|above)\b/i,
    /\bshow(?:ing)? you (?:a|the|our) (?:\w+ ){0,2}form\b/i,
    /\bform (?:is|has been|will be) (?:now )?(?:shown|displayed|showing|on (?:your |the )?screen|(?:right )?here)\b/i,
    /\bhere(?:'s| is) (?:a|the|our) (?:\w+ ){0,2}form\b/i,
  ].some((pattern) => pattern.test(said));
}

/** Curly apostrophes and quotes as straight ones: models and phone keyboards write "I’ll", the patterns "I'll". */
export const straightQuotes = (text: string) => text.replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"');

/** What a reply can tell the customer that only an action makes true. */
export type Claim = "form" | "person" | "team";

/**
 * What a reply tells the customer is done or happening that only an action does: a form on their screen, a person
 * from the team joining the chat, or their case passed on to the team. An offer ("I can connect you") isn't a claim.
 */
export function claimsIn(reply: string): Claim[] {
  const text = straightQuotes(reply);
  const claims: Claim[] = [];
  if (promisesForm(text)) claims.push("form");
  if (
    [
      /\b(?:i'?m|i am|i'?ll|i will|let me) (?:now )?(?:connect(?:ing)?|transfer(?:ring)?|put(?:ting)? you through|bring(?:ing)? in) (?:you|a|one|someone|our|the)\b/i,
      /\b(?:connecting|transferring) you\b/i,
      /\bi(?:'ve| have) (?:connected|transferred|handed) you\b/i,
      /\b(?:a|one of our|someone from (?:our|the)) (?:team member|colleague|specialist|person|member of (?:our|the) team)s? (?:will|is going to|is about to) (?:join|take over|be with you)\b/i,
      // A promise to bring someone in, now or "once you tell me": the customer waits for a person who never comes.
      /\b(?:i'?ll|i will|let me) (?:get|bring(?: in)?|have) (?:someone|a (?:team member|colleague|person|specialist|member of (?:our|the) team)|one of our)\b/i,
    ].some((pattern) => pattern.test(text))
  ) {
    claims.push("person");
  }
  if (
    [
      /\bi(?:'ve| have) (?:opened|created|raised|logged|submitted|filed) (?:a |an |your )?(?:ticket|support request|case)\b/i,
      /\bi(?:'ve| have) (?:passed|forwarded|sent|shared|escalated|flagged)\b[^.!?]{0,40}\b(?:to|with) (?:our|the) team\b/i,
      /\bi(?:'ve| have) let (?:our|the) team know\b/i,
    ].some((pattern) => pattern.test(text))
  ) {
    claims.push("team");
  }
  return claims;
}

/** A tool name as the model needs it: lowercase letters, digits and underscores. */
export const toolName = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "action";
