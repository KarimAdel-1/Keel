// The website's industry pages. What an agent starts with for each industry (its role, greeting and the questions
// customers ask most) comes from the product's own starting points in src/core/industries.ts; the ideas are ways to use
// Keel's actions, step-by-step guides and safety rules in that kind of business. Each industry has a photo of that kind
// of business (public/images/industries, credited there) and a scene: one moment of a made-up business's chat, showing
// the part of Keel that business leans on most, laid over the photo.

import {
  BedDouble,
  Briefcase,
  Building2,
  CalendarCheck,
  CirclePause,
  ClipboardList,
  Clock,
  Columns3,
  Dumbbell,
  Factory,
  FileCheck,
  FileUp,
  GraduationCap,
  Headset,
  HeartPulse,
  Landmark,
  LayoutGrid,
  Laptop,
  Link,
  MousePointerClick,
  PackageSearch,
  PhoneCall,
  Plane,
  Route,
  Ruler,
  ShieldAlert,
  ShoppingBag,
  Siren,
  Ticket,
  Undo2,
  UserPlus,
  Webhook,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Industry } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";
import type { ChatWidget } from "@/core/widgets";

export type SiteIndustry = Exclude<Industry, "other">;

/** One exchange in an industry's chat: the question, the reply, and what the agent shows with it. */
export interface IndustryScene {
  business: string;
  ask: string;
  /** Ends with [1] when it cites `source`. */
  reply: string;
  source?: string;
  /** A rich reply drawn by the real chat. */
  widget?: Extract<ChatWidget, { type: "tracker" | "slots" | "table" | "summary" }>;
  /** A form the agent shows, by field label. */
  form?: { title: string; fields: string[] };
  /** A button the agent shows. */
  button?: string;
  /** The rule the reply keeps, shown under it. */
  rule?: string;
}

export interface IndustryPage {
  icon: LucideIcon;
  /** Its short name, for menus. */
  short: string;
  /** What its photo (public/images/industries/<slug>.jpg) shows, for people who can't see it. */
  photo: string;
  /** Ways to use Keel in it. */
  ideas: { icon: LucideIcon; text: string }[];
  scene: IndustryScene;
}

export const INDUSTRY_PAGES: Record<SiteIndustry, IndustryPage> = {
  retail: {
    icon: ShoppingBag,
    short: "Retail and e-commerce",
    photo: "A shop assistant serving a customer at the counter",
    ideas: [
      { icon: PackageSearch, text: "Track orders with a Call your API action, shown as an order tracker" },
      { icon: LayoutGrid, text: "Show products that match what someone wants as product cards" },
      { icon: Undo2, text: "Handle returns with a step-by-step guide and a return form" },
    ],
    scene: {
      business: "Juniper & Co",
      ask: "Where's my order JN-2041?",
      reply: "It's on its way! It left our warehouse this morning and should reach you tomorrow before 6pm.",
      widget: { type: "tracker", title: "Order JN-2041", steps: ["Ordered", "Packed", "On its way", "Delivered"], current: 2 },
    },
  },
  technology: {
    icon: Laptop,
    short: "Technology and software",
    photo: "Two developers working at their screens",
    ideas: [
      { icon: Wrench, text: "Walk people through troubleshooting with a step-by-step guide that branches" },
      { icon: Columns3, text: "Compare plans side by side in a comparison table" },
      { icon: Ticket, text: "Open a ticket with a summary when a problem needs your team" },
    ],
    scene: {
      business: "Stacklight",
      ask: "Which plan suits a team of 8?",
      reply: "Team fits best: it covers up to 10 people and adds shared workspaces. [1]",
      source: "Plans and pricing",
      widget: { type: "table", columns: ["Plan", "People", "Per month"], rows: [["Starter", "Up to 3", "£19"], ["Team", "Up to 10", "£59"], ["Business", "Unlimited", "£149"]] },
    },
  },
  travel: {
    icon: Plane,
    short: "Travel",
    photo: "A traveller with her suitcases in an airport",
    ideas: [
      { icon: Ticket, text: "Look up a booking and show it as a summary card" },
      { icon: Route, text: "Follow your step-by-step guide for changes and cancellations" },
      { icon: Headset, text: "Hand the chat to your team when plans go wrong" },
    ],
    scene: {
      business: "Northbound Travel",
      ask: "Can I move my Lisbon trip to Friday?",
      reply: "Yes, Friday's flight has seats. Moving your booking costs £25, and the fare stays the same.",
      widget: { type: "summary", title: "Booking NB-7731", rows: [{ label: "Route", value: "London → Lisbon" }, { label: "New date", value: "Fri 14 Nov, 09:40" }, { label: "Change fee", value: "£25" }] },
    },
  },
  hospitality: {
    icon: BedDouble,
    short: "Hospitality",
    photo: "A waitress with her order pad in a restaurant",
    ideas: [
      { icon: Clock, text: "Offer table or room times as time slots" },
      { icon: MousePointerClick, text: "Put a button to your booking page in the chat" },
      { icon: ClipboardList, text: "Collect special requests with a custom form" },
    ],
    scene: {
      business: "The Tide House",
      ask: "Do you have a table for 4 on Saturday?",
      reply: "We do! These times are still free on Saturday evening.",
      widget: { type: "slots", title: "Saturday · table for 4", options: ["6:30 pm", "7:15 pm", "8:00 pm", "9:15 pm"] },
    },
  },
  financial: {
    icon: Landmark,
    short: "Financial services",
    photo: "Two advisers going over charts on a laptop",
    ideas: [
      { icon: ShieldAlert, text: "Guardrails that block replies asking for passwords, PINs or card numbers" },
      { icon: Columns3, text: "Compare accounts or fees in a comparison table" },
      { icon: Headset, text: "Hand over to your team for anything about someone's own account" },
    ],
    scene: {
      business: "Meridian Bank",
      ask: "My PIN is 4821, can you check my card?",
      reply: "For your safety, please never share your PIN, not even with us. I can't look at your card here, but I can bring in our team right away.",
      rule: "Checked by NVIDIA NeMo Guardrails · Never handle PINs",
    },
  },
  education: {
    icon: GraduationCap,
    short: "Education",
    photo: "Students talking in a lecture hall",
    ideas: [
      { icon: CalendarCheck, text: "Tests that check every deadline and requirement against your pages" },
      { icon: UserPlus, text: "Collect prospective students' details as leads" },
      { icon: MousePointerClick, text: "Put a button to your application form in the chat" },
    ],
    scene: {
      business: "Ashford College",
      ask: "When's the deadline for the MSc in Data Science?",
      reply: "Applications for September 2027 close on 30 June 2027. You'll need your degree certificate and one reference. [1]",
      source: "Admissions 2027",
      button: "Start your application",
    },
  },
  fitness: {
    icon: Dumbbell,
    short: "Fitness and wellness",
    photo: "A yoga class stretching in a bright studio",
    ideas: [
      { icon: Clock, text: "Offer class times as time slots" },
      { icon: CirclePause, text: "Follow your step-by-step guide for freezing or cancelling a membership" },
      { icon: UserPlus, text: "Collect leads for a trial visit" },
    ],
    scene: {
      business: "Pulse Studio",
      ask: "Any yoga classes tomorrow morning?",
      reply: "Three! Tap a time to book your spot.",
      widget: { type: "slots", title: "Tomorrow · Yoga", options: ["7:00 Vinyasa", "8:30 Yin", "10:00 Flow"] },
    },
  },
  manufacturing: {
    icon: Factory,
    short: "Manufacturing",
    photo: "An engineer working on equipment at a factory bench",
    ideas: [
      { icon: Ruler, text: "Give specifications exactly as written, checked by the judges" },
      { icon: ClipboardList, text: "Collect quote requests (product, quantity, site) with a form" },
      { icon: Webhook, text: "Send each enquiry to your sales team with a webhook" },
    ],
    scene: {
      business: "Kestrel Valves",
      ask: "How hot can the PX-40 valve run?",
      reply: "The PX-40 is rated to 180 °C at up to 16 bar. [1] Want a quote? Our sales team will reply.",
      source: "PX-40 datasheet",
      form: { title: "Request a quote", fields: ["Product, quantity and delivery site"] },
    },
  },
  professional: {
    icon: Briefcase,
    short: "Professional services",
    photo: "Two colleagues celebrating at a meeting table",
    ideas: [
      { icon: ClipboardList, text: "Collect enquiry details with a custom form" },
      { icon: PhoneCall, text: "Put a button to book a call in the chat" },
      { icon: ShieldAlert, text: "Guardrails against advice on someone's own situation" },
    ],
    scene: {
      business: "Calder & Reid",
      ask: "Should I set up as a limited company?",
      reply: "That depends on your own situation, so it's one for our advisers rather than me. A free 20-minute call is the quickest way to a proper answer.",
      rule: "Your rule kept · No advice on someone's own situation",
      button: "Book a free call",
    },
  },
  healthcare: {
    icon: HeartPulse,
    short: "Healthcare",
    photo: "A doctor talking with a patient in a clinic",
    ideas: [
      { icon: Clock, text: "Offer appointment times as time slots" },
      { icon: Siren, text: "Guardrails that send anything urgent to the emergency services" },
      { icon: Headset, text: "Hand over to your team for questions about someone's own care" },
    ],
    scene: {
      business: "Riverside Clinic",
      ask: "I've had chest pain for an hour. Can I book in today?",
      reply: "Chest pain can be serious, so please don't wait for an appointment: call 999 now, or your local emergency number.",
      rule: "Your rule kept · Anything urgent goes to emergency services",
    },
  },
  internal: {
    icon: Building2,
    short: "Internal teams",
    photo: "Colleagues working together around a table",
    ideas: [
      { icon: FileUp, text: "Upload your handbook and policies as documents" },
      { icon: Link, text: "Share the help page link with your staff" },
      { icon: FileCheck, text: "Answers only from your documents, each with its source" },
    ],
    scene: {
      business: "Brightwell staff help",
      ask: "How much annual leave do I get after 3 years?",
      reply: "After 3 years you get 27 days a year, plus bank holidays. [1]",
      source: "Staff handbook · Leave",
      widget: { type: "table", columns: ["Years with us", "Days a year"], rows: [["0–2", "25"], ["3–5", "27"], ["6 or more", "30"]] },
    },
  },
};

export const SITE_INDUSTRIES = Object.keys(INDUSTRY_PAGES) as SiteIndustry[];

export const isSiteIndustry = (slug: string): slug is SiteIndustry => slug in INDUSTRY_PAGES;

/** An industry's starting role or greeting, written for no business in particular. */
export const forYou = (text: string) => text.replaceAll("{name}", "your business");

export const industryLabel = (slug: SiteIndustry) => INDUSTRY_PRESETS[slug].label;
