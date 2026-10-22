import Link from "next/link";
import { BRAND } from "@/core/brand";

/** The name as the logo, until there is a logo. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="text-xl font-semibold tracking-[-0.03em]" aria-label={BRAND.name}>
      {BRAND.name.toLowerCase()}
      <span className="text-brand">.</span>
    </Link>
  );
}
