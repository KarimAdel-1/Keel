// Presentation presets: these fill the existing editors and use existing action/widget types.
import type { Industry } from "@/core/agents";
import type { ActionKind } from "@/core/actions";
import type { WidgetStarter } from "./WidgetsManager";

export interface ActionStarter {
  title: string;
  kind: ActionKind;
  description: string;
  config?: Record<string, unknown>;
}
const form = (title: string, description: string, field: string): ActionStarter => ({
  title,
  kind: "form",
  description,
  config: {
    title,
    submitLabel: "Send request",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "details", label: field, type: "long", required: true },
    ],
  },
});
const lookup = (title: string, description: string, parameter = "reference"): ActionStarter => ({
  title,
  kind: "api",
  description,
  config: { params: [{ name: parameter, type: "string", description: `The ${parameter.replaceAll("_", " ")} supplied by the customer`, required: true }] },
});
const contact = (title: string, description: string): ActionStarter => ({
  title,
  kind: "lead",
  description,
  config: { title, fields: ["name", "email", "company"] },
});

export const ACTION_STARTERS: Record<Industry, ActionStarter[]> = {
  retail: [
    lookup("Track an order", "Look up delivery status when a customer asks where their order is.", "order_number"),
    form("Request a return", "Collect a return request for the team to review.", "Order number and reason for return"),
    contact("Wholesale enquiry", "Collect contact details from a customer asking about wholesale orders."),
  ],
  technology: [
    form("Report a product issue", "Collect the details of a problem for the support team.", "What happened and how to reproduce it"),
    contact("Request a demo", "Collect contact details when a customer wants a product demonstration."),
    lookup("Check a subscription", "Look up a customer's current subscription in your system.", "customer_reference"),
  ],
  travel: [
    lookup("Find a booking", "Look up a trip using the customer's booking reference.", "booking_reference"),
    form("Request a booking change", "Send a travel change request to the team for review.", "Booking reference and requested change"),
  ],
  hospitality: [
    form("Request a reservation", "Collect a reservation request for your team to confirm.", "Preferred date, time and number of guests"),
    contact("Group booking enquiry", "Collect details for a group booking or event."),
  ],
  financial: [
    form(
      "Request a callback",
      "Arrange for the team to contact a customer about a service.",
      "Service and preferred contact time; do not include account secrets",
    ),
    lookup("Check request status", "Look up the status of a customer's service request."),
  ],
  education: [
    contact("Course enquiry", "Collect contact details from a prospective student."),
    form("Admissions question", "Send an admissions question to the team.", "Course and question"),
  ],
  fitness: [
    form("Request a trial class", "Collect a trial class request for staff to confirm.", "Class and preferred date"),
    lookup("Check class availability", "Look up available class times in your booking system.", "date"),
  ],
  manufacturing: [
    form("Request a quote", "Collect product requirements for a sales quote.", "Product, quantity and requirements"),
    lookup("Check shipment status", "Look up the delivery status of a business order."),
  ],
  professional: [
    contact("Request a consultation", "Collect details from a client asking to discuss your services."),
    form("Project enquiry", "Collect project requirements for the team to review.", "Project scope and preferred timeline"),
  ],
  healthcare: [
    form(
      "Appointment request",
      "Collect an appointment request for the clinic to confirm. Do not request medical records.",
      "Service and preferred date; do not include medical details",
    ),
    { title: "Speak to reception", kind: "handoff", description: "Hand the conversation to reception when a visitor needs a person." },
  ],
  internal: [
    form("Equipment request", "Send an employee's equipment request to the team.", "Equipment and reason"),
    form("Policy question", "Send a question the handbook does not answer to the team.", "Policy and question"),
  ],
  other: [
    contact("Contact request", "Collect contact details when someone wants to hear from the team."),
    form("Service request", "Send a service request to your team.", "How can we help?"),
  ],
};

const summary = (name: string, title: string, values: Record<string, string>): WidgetStarter => ({
  name,
  template: "summary",
  mapping: { title: "title", columns: Object.keys(values).map((label, i) => ({ label, path: `field${i}` })) },
  sample: { title, ...Object.fromEntries(Object.values(values).map((v, i) => [`field${i}`, v])) },
});
const slots = (name: string): WidgetStarter => ({
  name,
  template: "slots",
  mapping: { items: "times" },
  sample: { times: ["Monday · 10:00", "Monday · 14:30", "Tuesday · 09:00"] },
});
const cards = (name: string, items: { name: string; description: string; price: string }[]): WidgetStarter => ({
  name,
  template: "cards",
  mapping: { items: "items", title: "name", subtitle: "description", price: "price" },
  sample: { items },
});
const tracker = (name: string, stages: string[]): WidgetStarter => ({
  name,
  template: "tracker",
  mapping: { title: "title", steps: "stages", current: "current" },
  sample: { title: name, stages, current: 1 },
});
export const BUSINESS_WIDGETS: Record<Industry, WidgetStarter[]> = {
  retail: [
    summary("Return summary", "Return request", { Order: "HG-1043", Item: "Stoneware mug", Status: "Awaiting review" }),
    tracker("Return progress", ["Requested", "Under review", "Approved", "Completed"]),
  ],
  technology: [
    summary("Subscription overview", "Your subscription", { Plan: "Team", Seats: "5", Renewal: "1 November" }),
    tracker("Support ticket progress", ["Received", "Investigating", "Resolved"]),
  ],
  travel: [
    summary("Trip itinerary", "Your trip", { Destination: "Lisbon", Departure: "12 November", Travellers: "2" }),
    tracker("Booking status", ["Requested", "Confirmed", "Ready to travel"]),
  ],
  hospitality: [
    cards("Room selection", [
      { name: "Garden room", description: "Double room · garden view", price: "$140 / night" },
      { name: "Courtyard suite", description: "Suite · private terrace", price: "$210 / night" },
    ]),
    summary("Reservation details", "Your reservation", { Date: "12 November", Time: "19:30", Guests: "4" }),
  ],
  financial: [
    summary("Service request receipt", "Your request", { Reference: "SR-204", Service: "Callback", Status: "Received" }),
    tracker("Request progress", ["Received", "In review", "Completed"]),
  ],
  education: [
    cards("Course catalogue", [
      { name: "Design fundamentals", description: "6 weeks · online", price: "$180" },
      { name: "Creative writing", description: "4 weeks · online", price: "$120" },
    ]),
    summary("Application checklist", "Your application", { Form: "Received", Documents: "Pending", Review: "Not started" }),
  ],
  fitness: [
    slots("Class times"),
    cards("Membership options", [
      { name: "Studio", description: "8 classes each month", price: "$49 / month" },
      { name: "Unlimited", description: "All studio classes", price: "$89 / month" },
    ]),
  ],
  manufacturing: [
    summary("Quote summary", "Quote request", { Product: "Steel bracket", Quantity: "500", Status: "Awaiting sales review" }),
    tracker("Production progress", ["Confirmed", "In production", "Quality check", "Dispatched"]),
  ],
  professional: [
    slots("Consultation times"),
    summary("Project overview", "Project enquiry", { Service: "Consulting", Scope: "Initial review", Status: "Awaiting response" }),
  ],
  healthcare: [
    slots("Appointment times"),
    summary("Visit details", "Appointment request", { Service: "Reception consultation", Date: "12 November", Status: "Awaiting confirmation" }),
  ],
  internal: [
    tracker("Equipment request status", ["Submitted", "Approved", "Ordered", "Ready"]),
    summary("Request receipt", "Your request", { Reference: "IT-104", Team: "IT support", Status: "Received" }),
  ],
  other: [slots("Available appointments"), summary("Request summary", "Your request", { Reference: "REQ-104", Status: "Received", Team: "Customer support" })],
};
