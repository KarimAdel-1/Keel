import { Download } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Submission } from "@/platform/submissions";
import { EmptyState, LinkTabs } from "../ui";

export const SUBMISSION_RANGES = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["90", "90 days"],
  ["all", "All time"],
] as const;

const label = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * What visitors filled in through the agent's forms, as a table: one row a submission, one column a field, with the
 * form it came from and a link to its conversation.
 */
export function SubmissionsTable({
  agentId,
  base,
  range,
  submissions,
  formNames,
  exportKind,
  empty,
}: {
  agentId: string;
  base: string;
  range: string;
  submissions: Submission[];
  formNames: Record<string, string>;
  exportKind: "leads" | "data";
  empty: { icon: ReactNode; title: string; text: ReactNode };
}) {
  const keys = [...new Set(submissions.flatMap((s) => Object.keys(s.data)))].slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <LinkTabs tabs={SUBMISSION_RANGES.map(([key, l]) => ({ key, label: l, href: key === "30" ? base : `${base}?range=${key}` }))} active={range} />
        <a href={`/api/agents/${agentId}/export?kind=${exportKind}`} className="btn btn-secondary ml-auto">
          <Download className="size-4" /> Export CSV
        </a>
      </div>
      {submissions.length === 0 ? (
        <EmptyState icon={empty.icon} title={empty.title} text={empty.text} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line bg-panel-2/60 text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                {keys.map((k) => (
                  <th key={k} className="px-4 py-2.5 font-medium">
                    {label(k)}
                  </th>
                ))}
                <th className="px-4 py-2.5 font-medium">Form</th>
                <th className="px-4 py-2.5 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {submissions.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  {keys.map((k) => (
                    <td key={k} className="max-w-[260px] px-4 py-3">
                      <span className="line-clamp-3 break-words">{s.data[k] ?? ""}</span>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{(s.actionId && formNames[s.actionId]) || "Form"}</td>
                  <td className="min-w-48 px-4 py-3">
                    <details className="mb-2">
                      <summary className="cursor-pointer text-xs font-medium">View all fields</summary>
                      <dl className="mt-3 space-y-3 rounded-lg border border-line bg-panel-2 p-3">
                        {Object.entries(s.data).map(([key, value]) => <div key={key}><dt className="text-xs font-medium text-muted">{label(key)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value}</dd></div>)}
                      </dl>
                    </details>
                    {s.conversationId && (
                      <Link href={`/app/agents/${agentId}/activity?c=${s.conversationId}`} className="text-xs font-medium underline underline-offset-2">
                        Conversation
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
