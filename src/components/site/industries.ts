// The website's industry pages. What an agent starts with for each industry (its role, greeting and the questions
// customers ask most) comes from the product's own starting points in src/core/industries.ts; the ideas are ways to use
// Keel's actions, step-by-step guides and safety rules in that kind of business.

import { BedDouble, Briefcase, Building2, Dumbbell, Factory, GraduationCap, HeartPulse, Landmark, Laptop, Plane, ShoppingBag, type LucideIcon } from "lucide-react";
import type { Industry } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";

export type SiteIndustry = Exclude<Industry, "other">;

/** Each industry's icon, its short name for menus, and ideas for using Keel in it. */
export const INDUSTRY_PAGES: Record<SiteIndustry, { icon: LucideIcon; short: string; ideas: string[] }> = {
  retail: {
    icon: ShoppingBag,
    short: "Retail and e-commerce",
    ideas: ["Track orders with a Call your API action, shown as an order tracker", "Show products that match what someone wants as product cards", "Handle returns with a step-by-step guide and a return form"],
  },
  technology: {
    icon: Laptop,
    short: "Technology and software",
    ideas: ["Walk people through troubleshooting with a step-by-step guide that branches", "Compare plans side by side in a comparison table", "Open a ticket with a summary when a problem needs your team"],
  },
  travel: {
    icon: Plane,
    short: "Travel",
    ideas: ["Look up a booking and show it as a summary card", "Follow your step-by-step guide for changes and cancellations", "Hand the chat to your team when plans go wrong"],
  },
  hospitality: {
    icon: BedDouble,
    short: "Hospitality",
    ideas: ["Offer table or room times as time slots", "Put a button to your booking page in the chat", "Collect special requests with a custom form"],
  },
  financial: {
    icon: Landmark,
    short: "Financial services",
    ideas: ["Guardrails that block replies asking for passwords, PINs or card numbers", "Compare accounts or fees in a comparison table", "Hand over to your team for anything about someone's own account"],
  },
  education: {
    icon: GraduationCap,
    short: "Education",
    ideas: ["Tests that check every deadline and requirement against your pages", "Collect prospective students' details as leads", "Put a button to your application form in the chat"],
  },
  fitness: {
    icon: Dumbbell,
    short: "Fitness and wellness",
    ideas: ["Offer class times as time slots", "Follow your step-by-step guide for freezing or cancelling a membership", "Collect leads for a trial visit"],
  },
  manufacturing: {
    icon: Factory,
    short: "Manufacturing",
    ideas: ["Give specifications exactly as written, checked by the judges", "Collect quote requests (product, quantity, site) with a form", "Send each enquiry to your sales team with a webhook"],
  },
  professional: {
    icon: Briefcase,
    short: "Professional services",
    ideas: ["Collect enquiry details with a custom form", "Put a button to book a call in the chat", "Guardrails against advice on someone's own situation"],
  },
  healthcare: {
    icon: HeartPulse,
    short: "Healthcare",
    ideas: ["Offer appointment times as time slots", "Guardrails that send anything urgent to the emergency services", "Hand over to your team for questions about someone's own care"],
  },
  internal: {
    icon: Building2,
    short: "Internal teams",
    ideas: ["Upload your handbook and policies as documents", "Share the help page link with your staff", "Answers only from your documents, each with its source"],
  },
};

export const SITE_INDUSTRIES = Object.keys(INDUSTRY_PAGES) as SiteIndustry[];

export const isSiteIndustry = (slug: string): slug is SiteIndustry => slug in INDUSTRY_PAGES;

/** An industry's starting role or greeting, written for no business in particular. */
export const forYou = (text: string) => text.replaceAll("{name}", "your business");

export const industryLabel = (slug: SiteIndustry) => INDUSTRY_PRESETS[slug].label;
