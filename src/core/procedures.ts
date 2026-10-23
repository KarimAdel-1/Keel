// Procedures: step-by-step playbooks the agent follows for one kind of request. A trigger says when it applies; the
// steps are plain numbered lines, where "@name" means "call this action" and "If …:" / "Otherwise:" start branches
// whose steps are indented beneath them. Pure: matching and running are in src/platform/procedures.ts.

export interface Procedure {
  id: string;
  agentId: string;
  name: string;
  /** When it applies, in a sentence. */
  trigger: string;
  steps: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The actions a procedure's steps call (without the @). */
export const actionsIn = (steps: string) => [...new Set([...steps.matchAll(/@([a-z0-9_]+)/g)].map((m) => m[1]))];

export interface ProcedureTemplate {
  area: string;
  name: string;
  text: string;
  trigger: string;
  steps: string;
  /** Actions the steps call, with the kind to create when the agent doesn't have them. */
  needs: { name: string; kind: "escalate" | "handoff" | "api" | "lead" | "data" | "form" | "button" }[];
}

export const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  {
    area: "Support",
    name: "Hand over to a person",
    text: "Bring in someone from the team when the customer asks for a person or is upset, and open a ticket when no one is available.",
    trigger: "The customer asks to speak to a person, or is frustrated and the answer isn't helping.",
    steps: `1. Apologise briefly and say you'll bring in someone from the team.
2. If the customer hasn't said what they need yet:
   1. Ask what they need help with, in one question.
3. Use @hand_over_to_person with a one-sentence reason.`,
    needs: [{ name: "hand_over_to_person", kind: "handoff" }],
  },
  {
    area: "Support",
    name: "Escalate an unsolved problem",
    text: "When the knowledge doesn't solve it, collect the essentials and open a ticket for the team.",
    trigger: "The customer has a problem that the agent's information doesn't solve after one try.",
    steps: `1. Say you'll pass it to the team so nothing gets lost.
2. Ask for the one or two details the team will need (an order number, an account email).
3. Use @create_ticket with a summary of the problem and those details.
4. Tell the customer the team will follow up, and roughly when if your information says.`,
    needs: [{ name: "create_ticket", kind: "escalate" }],
  },
  {
    area: "E-commerce",
    name: "Where is my order",
    text: "Look the order up in your system and tell the customer where it is, with a tracker.",
    trigger: "The customer asks where their order is, when it will arrive, or for tracking.",
    steps: `1. Ask for the order number if they haven't given it.
2. Use @look_up_order with the order number.
3. If the order was found:
   1. Tell them its status and expected delivery in one or two sentences.
4. Otherwise:
   1. Ask them to check the number; after a second failed try, use @create_ticket.`,
    needs: [
      { name: "look_up_order", kind: "api" },
      { name: "create_ticket", kind: "escalate" },
    ],
  },
  {
    area: "E-commerce",
    name: "Return or refund",
    text: "Check the request against your return policy, then collect the return details or pass it to the team.",
    trigger: "The customer wants to return or exchange an item, get their money back or a replacement, or says one arrived broken, damaged, faulty or wrong.",
    steps: `1. Answer what they asked from your return policy: the window, the condition items must be in, what it costs and how the refund is paid.
2. If you don't know yet what they want to return and when it was delivered, ask, in one question.
3. If it's within the return window in your information:
   1. Use @show_request_form so they can give the order number and reason.
   2. Explain the next steps from your return policy.
4. Otherwise:
   1. Explain, kindly, that it's outside the return window.
   2. If they still want to ask for an exception, use @create_ticket.`,
    needs: [
      { name: "show_request_form", kind: "form" },
      { name: "create_ticket", kind: "escalate" },
    ],
  },
  {
    area: "Sales",
    name: "Qualify a lead",
    text: "Understand what the visitor needs, answer their questions, and collect their details for the team.",
    trigger: "The visitor wants a demo, a quote or to hear from the sales team, or asks about buying for a business or a team (wholesale, bulk or company orders). Not someone asking about a product or a price for themselves.",
    steps: `1. Answer their questions from your information.
2. If you don't know yet what they need: ask what they're looking for and how much or for how many, in one question.
3. Use @collect_lead so the team can follow up.
4. Thank them and say when the team usually replies, if your information says.`,
    needs: [{ name: "collect_lead", kind: "lead" }],
  },
  {
    area: "Bookings",
    name: "Make a booking request",
    text: "Collect what a booking needs and pass it on, for businesses that confirm bookings by hand.",
    trigger: "The customer wants to book a table, a room, a class or an appointment.",
    steps: `1. Ask for the date, time and number of people (or the service), if they haven't said.
2. Use @show_request_form so they can confirm their details.
3. Tell them the team will confirm the booking, and how, from your information.`,
    needs: [{ name: "show_request_form", kind: "form" }],
  },
];
