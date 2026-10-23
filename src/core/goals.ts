// What an owner wants their assistant to do, in their own words ("let customers reach a person"), instead of which
// settings to turn on. Each goal is the actions and step-by-step guides (procedures) that do it, with good defaults;
// choosing it sets them up, and an industry starts with the goals that kind of business usually needs. Pure
// definitions; applying them is src/platform/goals.ts.

import type { ActionConfigs, ActionKind } from "./actions";
import type { Industry } from "./agents";

export const GOAL_KEYS = ["person", "leads", "bookings", "returns", "followups"] as const;
export type GoalKey = (typeof GOAL_KEYS)[number];

export interface Goal {
  title: string;
  /** What the customer and the owner get, in a sentence. */
  text: string;
  /**
   * The actions it needs: `ref` is the name its procedures call (@ref), `name` the action's own when it differs (two
   * goals each with a form), with their settings for this goal.
   */
  actions: { kind: ActionKind; ref: string; name?: string; title?: string; description?: string; config?: Partial<ActionConfigs[ActionKind]> }[];
  /** The procedure templates it adds (src/core/procedures.ts), by name. */
  procedures: string[];
}

/** When the agent shows each goal's form: said plainly, so a customer's own words ("it arrived broken") lead to it. */
export const RETURN_FORM_WHEN = "Use when the customer wants to return or exchange an item, get a refund or a replacement, or says one arrived broken, damaged, faulty or wrong.";
export const BOOKING_FORM_WHEN = "Use when the customer wants to book a table, a room, a class or an appointment.";

export const GOALS: Record<GoalKey, Goal> = {
  person: {
    title: "Let customers reach a person",
    text: "When someone asks for a person, or the agent can't help, your team takes over the chat or gets a ticket, and you're alerted.",
    actions: [
      { kind: "handoff", ref: "hand_over_to_person" },
      { kind: "escalate", ref: "create_ticket" },
    ],
    procedures: ["Hand over to a person"],
  },
  leads: {
    title: "Collect leads",
    text: "When someone wants a quote, a demo, or to buy for their business or team, the agent asks for their details for your team.",
    actions: [{ kind: "lead", ref: "collect_lead", config: { title: "Leave your details and we'll be in touch", fields: ["name", "email", "phone"], submitLabel: "Send" } }],
    procedures: ["Qualify a lead"],
  },
  bookings: {
    title: "Take booking requests",
    text: "Customers ask for a table, a room, a class or an appointment; the agent collects the details and your team confirms.",
    actions: [
      {
        kind: "form",
        ref: "show_request_form",
        name: "show_booking_form",
        title: "Booking request",
        description: BOOKING_FORM_WHEN,
        config: {
          title: "Booking request",
          fields: [
            { key: "name", label: "Your name", type: "text", required: true },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "date", label: "Date", type: "date", required: true },
            { key: "details", label: "Time, number of people, anything else", type: "long", required: false },
          ],
          submitLabel: "Send request",
        },
      },
    ],
    procedures: ["Make a booking request"],
  },
  returns: {
    title: "Handle returns and refunds",
    text: "The agent checks a request against your return policy, collects the order details, and passes exceptions to your team.",
    actions: [
      {
        kind: "form",
        ref: "show_request_form",
        name: "show_return_form",
        title: "Return request",
        description: RETURN_FORM_WHEN,
        config: {
          title: "Return request",
          fields: [
            { key: "order_number", label: "Order number", type: "text", required: true },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "reason", label: "What's wrong with it?", type: "long", required: true },
          ],
          submitLabel: "Send request",
        },
      },
      { kind: "escalate", ref: "create_ticket" },
    ],
    procedures: ["Return or refund"],
  },
  followups: {
    title: "Suggest what to ask next",
    text: "After each answer, one-tap buttons with the questions customers usually ask next.",
    actions: [{ kind: "followups", ref: "suggest_followups", config: { count: 3 } }],
    procedures: [],
  },
};

/** The goals each kind of business usually starts with (every agent can reach a person). */
export const INDUSTRY_GOALS: Record<Industry, GoalKey[]> = {
  retail: ["person", "returns", "followups"],
  technology: ["person", "leads", "followups"],
  travel: ["person", "bookings"],
  hospitality: ["person", "bookings", "followups"],
  financial: ["person"],
  education: ["person", "leads"],
  fitness: ["person", "bookings", "leads"],
  manufacturing: ["person", "leads"],
  professional: ["person", "leads"],
  healthcare: ["person", "bookings"],
  internal: ["person"],
  other: ["person", "followups"],
};
