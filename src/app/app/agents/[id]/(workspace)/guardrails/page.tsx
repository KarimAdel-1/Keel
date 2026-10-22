import type { Metadata } from "next";
import { GuardrailsEditor } from "@/components/build/GuardrailsEditor";
import { railsStatus } from "@/lib/rails";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "Safety and limits" };

export default async function GuardrailsPage({ params }: PageProps<"/app/agents/[id]/guardrails">) {
  const { agent } = await requireAgent((await params).id);
  return <GuardrailsEditor agent={agent} rails={railsStatus()} />;
}
