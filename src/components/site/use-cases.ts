// The website's use cases: common jobs a business gives its agent, and how Keel's parts fit together for each. The
// example conversations are made up for an imaginary business; the steps are what a builder really does in Keel.

import { Building2, Compass, Handshake, Headset, PackageSearch, type LucideIcon } from "lucide-react";
import type { Industry } from "@/core/agents";
import type { ExampleTurn } from "./visuals";

export interface UseCase {
  slug: string;
  name: string;
  icon: LucideIcon;
  summary: string;
  title: string;
  intro: string;
  /** What the agent takes care of. */
  handles: { title: string; text: string }[];
  /** An example conversation, for an imaginary business. */
  business: string;
  conversation: ExampleTurn[];
  /** How a builder sets it up in Keel, step by step; `feature` links each step to its page. */
  setup: { title: string; text: string; feature: string }[];
  /** A test a builder could write for it. */
  test: { customer: string; passes: string; actions?: string[] };
  industries: Industry[];
}

export const USE_CASES: UseCase[] = [
  {
    slug: "customer-support",
    name: "Customer support",
    icon: Headset,
    summary: "Answer customers' questions around the clock, and bring in your team when it matters.",
    title: "Customer support that answers from your own information",
    intro:
      "Most of what customers ask is already answered somewhere on your website or in your documents. Your agent finds the answer, shows where it came from, and hands over to your team when someone needs a person.",
    handles: [
      { title: "Policy questions", text: "Shipping, returns, opening hours, fees: answered with the conditions and exceptions that apply, and the source." },
      { title: "Several questions at once", text: "Customers rarely ask one thing. The agent answers each part, and follows up in context." },
      { title: "What it doesn't know", text: "When your information doesn't cover it, the agent says so and offers your team, instead of guessing." },
      { title: "People who need a person", text: "An upset customer or a request it can't handle becomes a live handover or a ticket with a summary, and your team is told at once." },
    ],
    business: "Harbor Goods",
    conversation: [
      { from: "customer", text: "Hi, can I return a gift if I don't have the receipt?" },
      { from: "agent", text: "Yes. A gift can be returned within 30 days of delivery for a gift card of the same value. We'll just need the order number or the buyer's email address.", source: "Returns and refunds" },
      { from: "customer", text: "I'd rather talk to someone about it." },
      { from: "agent", text: "Of course. I've passed this to our team with a summary of our chat. They'll reply right here." },
    ],
    setup: [
      { title: "Read your website and documents", text: "Keel learns your policies and drafts the agent.", feature: "knowledge" },
      { title: "Let customers reach a person", text: "One goal turns on live handover and tickets, with alerts for your team.", feature: "setup" },
      { title: "Test it with AI customers", text: "A crowd of customers, each fact checked against your information.", feature: "testing" },
      { title: "Launch and answer handovers", text: "Put it on your site or in WhatsApp, and reply from the Helpdesk inbox.", feature: "helpdesk" },
    ],
    test: {
      customer: "A customer who bought a gift, lost the receipt, and wants to know whether they can still return it.",
      passes: "The agent explains the gift return rules from the returns policy, and doesn't promise a refund the policy doesn't offer.",
    },
    industries: ["retail", "travel", "hospitality", "technology", "financial"],
  },
  {
    slug: "sales-and-leads",
    name: "Sales and leads",
    icon: Handshake,
    summary: "Answer questions before people buy, show what fits, and collect the details of interested visitors.",
    title: "Turn questions before buying into leads",
    intro:
      "Visitors ask about products, plans and prices before they buy. Your agent answers from your information, shows what fits, and when someone is interested, asks for their details and passes them to your team.",
    handles: [
      { title: "Product and plan questions", text: "What's included, what it costs, which option fits: from your own pages, never invented." },
      { title: "Showing what fits", text: "Products, plans or rooms as cards or a comparison table, from your own system." },
      { title: "Collecting leads", text: "A short form for name, email, phone and company. Every lead lands in Leads and Contacts." },
      { title: "The next step", text: "A button to checkout, booking or a demo page, and a webhook that tells your systems about each lead." },
    ],
    business: "Harbor Software",
    conversation: [
      { from: "customer", text: "Do you have a plan for a team of 12?" },
      { from: "agent", text: "Yes. The Team plan covers up to 15 people and includes shared inboxes and reporting.", source: "Pricing" },
      { from: "customer", text: "Great, can someone show me a demo?" },
      { from: "agent", text: "Happy to arrange that. Leave your details and our team will be in touch.", form: ["Name", "Work email", "Company"] },
    ],
    setup: [
      { title: "Read your product and pricing pages", text: "So answers before buying are exact.", feature: "knowledge" },
      { title: "Add Collect leads and a link button", text: "A form for interested visitors, a button to your demo page.", feature: "actions" },
      { title: "Send leads to your systems", text: "A webhook for each lead, and every lead kept in Contacts.", feature: "helpdesk" },
      { title: "Watch what people ask", text: "Topics and sentiment show what buyers want to know.", feature: "analytics" },
    ],
    test: {
      customer: "A buyer comparing plans for a team of 12 who would like a demo.",
      passes: "The agent recommends the plan that fits 12 people from the pricing page, and offers the form to arrange a demo.",
      actions: ["collect_lead"],
    },
    industries: ["technology", "professional", "manufacturing", "education", "fitness"],
  },
  {
    slug: "orders-and-bookings",
    name: "Orders and bookings",
    icon: PackageSearch,
    summary: "Look up orders and bookings in your own system, and show where things stand.",
    title: "Order and booking questions, answered from your own system",
    intro:
      "\"Where is my order?\" and \"Can I move my booking?\" need your live data. Give the agent a Call your API action and it looks the answer up, shows it as a tracker, cards or time slots, and follows your step-by-step guide for changes.",
    handles: [
      { title: "Where things are", text: "An order, a booking or a request, shown step by step in an order tracker." },
      { title: "Times to choose from", text: "Appointment, table or class times as time slots; tapping one answers for the customer." },
      { title: "Account and booking details", text: "A summary card with a few labelled values, straight from your system." },
      { title: "Changes and returns", text: "A step-by-step guide with the steps you'd follow, collecting the details it needs on the way." },
    ],
    business: "Harbor Goods",
    conversation: [
      { from: "customer", text: "Where's my order HG-1043?" },
      { from: "agent", text: "It shipped yesterday and should arrive on Thursday.", tracker: ["Ordered", "Packed", "Shipped", "Delivered"], trackerAt: 2 },
      { from: "customer", text: "Thanks! Can I still change the delivery address?" },
      { from: "agent", text: "Orders can be changed within 2 hours of being placed. Once an order has left the studio, the address can't be changed, but you can return it when it arrives.", source: "Orders and payment" },
    ],
    setup: [
      { title: "Connect your system", text: "A Call your API action, tried with real values before it goes live.", feature: "actions" },
      { title: "Choose how to show it", text: "An order tracker, cards, time slots, a table or a summary card.", feature: "actions" },
      { title: "Write the guide for changes", text: "Numbered steps, with branches and the actions to call.", feature: "procedures" },
      { title: "Test it safely", text: "In tests, your API isn't called: each action returns what you write.", feature: "testing" },
    ],
    test: {
      customer: "Sam, whose order HG-1043 hasn't arrived. They're polite but short on time.",
      passes: "The agent looks up the order and tells Sam when it will arrive, without inventing a date.",
      actions: ["order_status"],
    },
    industries: ["retail", "travel", "hospitality", "fitness", "healthcare"],
  },
  {
    slug: "product-help",
    name: "Product help and onboarding",
    icon: Compass,
    summary: "Help people get started and fix common problems, step by step.",
    title: "Help people get started, and get unstuck",
    intro:
      "Explaining features, setting up, troubleshooting: your agent walks people through it from your help articles and guides, one step at a time, and opens a ticket when a problem needs your team.",
    handles: [
      { title: "Getting started", text: "The first steps, in order, from your own guides." },
      { title: "Which plan or feature", text: "What each one does and who it's for, exactly as your pages say." },
      { title: "Troubleshooting", text: "A step-by-step guide with the checks to try, branching on what the customer says." },
      { title: "Problems for your team", text: "When the steps don't help, a ticket with what was tried already." },
    ],
    business: "Harbor Software",
    conversation: [
      { from: "customer", text: "I reset my password but still can't log in." },
      { from: "agent", text: "Let's sort it out. First, open the reset link from the newest email only: older links stop working once a new one is sent. Did that work?", source: "Help centre: Signing in" },
      { from: "customer", text: "No, same error." },
      { from: "agent", text: "Thanks for trying. I've opened a ticket for our support team with the steps you've tried, so you won't need to repeat them." },
    ],
    setup: [
      { title: "Read your help centre and guides", text: "Every article becomes something the agent can cite.", feature: "knowledge" },
      { title: "Write your troubleshooting steps", text: "A step-by-step guide the agent follows, branch by branch.", feature: "procedures" },
      { title: "Check the answers", text: "A quality check grades its answers blind against your information.", feature: "quality" },
      { title: "Hand over what's left", text: "Tickets with a summary, answered from the Helpdesk inbox.", feature: "helpdesk" },
    ],
    test: {
      customer: "A new user who reset their password and still can't sign in, and is getting impatient.",
      passes: "The agent gives the sign-in steps from the help centre one at a time, and opens a ticket when they don't work.",
      actions: ["create_ticket"],
    },
    industries: ["technology", "education", "financial", "manufacturing"],
  },
  {
    slug: "internal-help",
    name: "Answers for your team",
    icon: Building2,
    summary: "HR and finance questions answered from your handbook, for your own staff.",
    title: "Answers for your own team, from your handbook",
    intro:
      "Leave, benefits, expenses, policies: your team asks the same questions every week. Upload your handbook and policies, and share the agent's help page with your staff. It answers only from your documents and points people to the right team.",
    handles: [
      { title: "Policies", text: "Leave, benefits, expenses and working hours, with the passage each answer comes from." },
      { title: "How to do things", text: "Submitting an expense, booking leave, who approves what." },
      { title: "Who to ask", text: "When the handbook doesn't cover it, the agent says so and names the right team." },
      { title: "Sensitive questions", text: "No individual legal, tax or medical advice: it points people to the right person instead." },
    ],
    business: "Harbor Goods HR",
    conversation: [
      { from: "customer", text: "How many vacation days do I get in my first year?" },
      { from: "agent", text: "Full-time employees get 25 days a year, counted from your start date. In your first year they're pro rata.", source: "Employee handbook: Leave" },
      { from: "customer", text: "And who approves them?" },
      { from: "agent", text: "Your line manager approves leave in the HR system. For anything unusual, the People team can help.", source: "Employee handbook: Leave" },
    ],
    setup: [
      { title: "Upload your handbook", text: "PDF and Word documents, read and searchable in minutes.", feature: "knowledge" },
      { title: "Start from the internal setup", text: "A role written for staff questions, with no individual advice.", feature: "knowledge" },
      { title: "Share the help page", text: "A page of its own, at a link you send to your team.", feature: "channels" },
      { title: "Check it before sharing", text: "AI customers ask what staff ask; judges check every fact.", feature: "testing" },
    ],
    test: {
      customer: "A new employee asking how many vacation days they get in their first year.",
      passes: "The agent gives the allowance and the first-year rule exactly as the handbook says.",
    },
    industries: ["internal"],
  },
];

export const caseBySlug = (slug: string) => USE_CASES.find((u) => u.slug === slug);
