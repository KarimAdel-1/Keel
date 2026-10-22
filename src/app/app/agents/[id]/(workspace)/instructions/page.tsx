import type { Metadata } from "next";
import { InstructionsEditor } from "@/components/agent/InstructionsEditor";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "How it behaves" };

export default async function InstructionsPage({ params }: PageProps<"/app/agents/[id]/instructions">) {
  const { agent } = await requireAgent((await params).id);
  return <InstructionsEditor agent={agent} />;
}
