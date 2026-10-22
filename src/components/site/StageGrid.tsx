import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { FEATURES, STAGES } from "./features";

/** The four stages side by side, each with its features. */
export function StageGrid() {
  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STAGES.map(({ stage, text }, i) => (
        <div key={stage} className="rounded-[18px] border border-[#eceef2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[13px] font-medium text-[#2348d8]">{i + 1}</p>
          <p className="mt-1 text-[19px] tracking-[-0.01em]">{stage}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b5f66]">{text}</p>
          <ul className="mt-5 space-y-2.5">
            {FEATURES.filter((f) => f.stage === stage).map(({ icon: Icon, ...f }) => (
              <li key={f.slug}>
                <Link href={`/features/${f.slug}`} className="group inline-flex items-center gap-2 text-[14px] text-[#2b2e33] hover:text-[#2348d8]">
                  <Icon className="size-4 text-[#2348d8]" /> {f.name}
                  <ArrowRight className="size-3.5 opacity-0 transition group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
