import { requireAgent } from "@/platform/session";

/** An agent's pages: each draws its own bar; this only checks the agent belongs to the signed-in user. */
export default async function AgentLayout({ children, params }: LayoutProps<"/app/agents/[id]">) {
  await requireAgent((await params).id);
  return <>{children}</>;
}
