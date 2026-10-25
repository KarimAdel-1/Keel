import { Sidebar } from "@/components/shell/Sidebar";
import { TeamAlertsLoader } from "@/components/shell/TeamAlertsLoader";
import { workspacesOf } from "@/platform/accounts";
import { requireUser } from "@/platform/session";
import { setupSteps } from "@/platform/setup";
import { listAgents } from "@/platform/store";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const { user, workspace } = await requireUser();
  const agents = await Promise.all(
    (await listAgents(workspace.id)).map(async (a) => ({
      id: a.id,
      name: a.name,
      displayName: a.config.appearance.displayName,
      color: a.config.appearance.color,
      ...(a.config.appearance.avatar ? { avatar: a.config.appearance.avatar } : {}),
      steps: (await setupSteps(a)).map((s) => ({ title: s.title, done: s.done, href: s.href })),
    })),
  );
  return (
    <div className="dashboard min-h-dvh bg-panel lg:flex">
      <Sidebar
        user={{ name: user.name, email: user.email }}
        workspace={workspace.name}
        agents={agents}
        workspaces={(await workspacesOf(user.id)).map((w) => ({ id: w.id, name: w.name, current: w.id === workspace.id }))}
      />
      <main className="min-w-0 flex-1 bg-[var(--bg)]">{children}</main>
      <TeamAlertsLoader />
    </div>
  );
}
