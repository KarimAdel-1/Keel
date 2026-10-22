import { Globe } from "lucide-react";
import Link from "next/link";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { FEATURES } from "./features";
import { SITE_INDUSTRIES } from "./industries";
import { USE_CASES } from "./use-cases";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Product",
    links: [
      ["Overview", "/product"],
      ["All features", "/features"],
      ["Technology", "/technology"],
      ["FAQ", "/#faq"],
    ],
  },
  { title: "Features", links: FEATURES.map((f) => [f.name, `/features/${f.slug}`]) },
  { title: "Use cases", links: USE_CASES.map((u) => [u.name, `/use-cases/${u.slug}`]) },
  { title: "Industries", links: [...SITE_INDUSTRIES.map((s): [string, string] => [INDUSTRY_PRESETS[s].label, `/industries/${s}`])] },
  {
    title: "Built with",
    links: [
      ["NVIDIA Nemotron", "https://www.nvidia.com/en-us/ai-data-science/foundation-models/nemotron/"],
      ["NVIDIA NeMo Guardrails", "https://github.com/NVIDIA/NeMo-Guardrails"],
      ["NVIDIA garak", "https://github.com/NVIDIA/garak"],
      ["Nebius Token Factory", "https://tokenfactory.nebius.com"],
    ],
  },
];

export function SiteFooter({ start, signedIn }: { start: string; signedIn: boolean }) {
  return (
    <footer className="bg-[#0f1012] text-white">
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-16 sm:px-8">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr_1fr]">
          <div>
            <p className="text-[20px] font-bold tracking-[-0.04em]">
              keel<span className="text-[#6f8cff]">.</span>
            </p>
            <p className="mt-4 max-w-[220px] text-[13px] leading-relaxed text-white/60">AI agents for your business, built on NVIDIA Nemotron.</p>
            <Link href={start} className="mt-6 inline-flex rounded-lg border border-white/25 px-4 py-2 text-[13px] hover:bg-white hover:text-[#111214]">
              {signedIn ? "Open your dashboard" : "Create your agent"}
            </Link>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-[14px] font-medium">{col.title}</p>
              <ul className="mt-5 space-y-3 text-[13px] text-white/60">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    {href.startsWith("http") ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-white">
                        {label}
                      </a>
                    ) : (
                      <Link href={href} className="hover:text-white">
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 py-7 text-[13px] text-white/60">
          <span className="inline-flex items-center gap-2">
            <Globe className="size-4" /> English
          </span>
          <span>© 2026 Keel. Runs on NVIDIA Nemotron models, served by Nebius Token Factory.</span>
        </div>
      </div>
    </footer>
  );
}
