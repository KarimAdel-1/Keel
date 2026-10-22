"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A piece of code or a link to copy, with a button that says when it's copied. */
export function CopyCode({ code, label = "Copy" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {/* Long lines wrap, clear of the button, so the whole snippet can be read before it's copied. */}
      <pre className="whitespace-pre-wrap rounded-lg [overflow-wrap:anywhere] bg-[#16171a] py-3.5 pl-4 pr-32 font-mono text-[12px] leading-relaxed text-[#e6e7ea]">{code}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-[#2c2e33] px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-[#3a3c42]"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : label}
      </button>
    </div>
  );
}
