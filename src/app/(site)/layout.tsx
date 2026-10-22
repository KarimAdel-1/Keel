import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { currentUser } from "@/platform/session";

const display = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-display" });

/** Keel's website: the home page and the product, feature, use-case, industry and technology pages. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <div className={`${display.variable} flex flex-1 flex-col bg-white text-[#111214] [font-family:var(--font-display)]`}>
      <SiteHeader signedIn={Boolean(user)} />
      <main className="flex-1">{children}</main>
      <SiteFooter start={user ? "/app" : "/signup"} signedIn={Boolean(user)} />
    </div>
  );
}
