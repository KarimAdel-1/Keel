import { z } from "zod";
import { MAX_UPLOAD_BYTES, normalUrl, qaText } from "@/core/agents";
import { firstProblem } from "@/platform/agent-input";
import { queueTraining, siteReads, startSiteRead } from "@/platform/knowledge/jobs";
import { refreshAfterDocuments } from "@/platform/knowledge/refresh";
import { uploadText } from "@/platform/pictures";
import { apiAgent } from "@/platform/session";
import { addSource, listSources, sourceSummary } from "@/platform/store";
import { LIMITS } from "@/core/limits";

const FULL = `This agent's knowledge is full (${LIMITS.knowledgeChars.toLocaleString("en-GB")} characters). Remove sources you no longer need to add more.`;

/** Everything the agent knows, with each source's status, and any website being read. */
export async function GET(_request: Request, { params }: RouteContext<"/api/agents/[id]/sources">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  return Response.json({ sources: await listSources(access.agent.id), reads: siteReads(access.agent.id) });
}

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    title: z.string().trim().min(1, "Give this text a title, so you can find it later.").max(200),
    content: z.string().trim().min(20, "Add a little more text: at least a sentence or two.").max(500_000),
  }),
  z.object({
    kind: z.literal("qa"),
    question: z.string().trim().min(3, "Write the question.").max(500),
    answer: z.string().trim().min(1, "Write the answer.").max(10_000),
  }),
  z.object({ kind: z.literal("website"), url: z.string().max(2000), maxPages: z.number().int().min(1).max(200).optional(), choose: z.boolean().optional() }),
]);

/** Adds knowledge: uploaded files (multipart), a text, a Q&A pair, or a website to read. Training runs in the background. */
export async function POST(request: Request, { params }: RouteContext<"/api/agents/[id]/sources">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const agentId = access.agent.id;
  let used = (await sourceSummary(agentId)).chars;
  if (used >= LIMITS.knowledgeChars) return Response.json({ error: FULL }, { status: 400 });

  if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => undefined);
    const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
    if (!files.length) return Response.json({ error: "Choose at least one file." }, { status: 400 });
    const added = [];
    const problems: { file: string; error: string }[] = [];
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push({ file: file.name, error: `It's larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Split it into smaller files.` });
        continue;
      }
      try {
        const text = await uploadText(agentId, file.name, new Uint8Array(await file.arrayBuffer()));
        if (text.length < 20) {
          problems.push({ file: file.name, error: "No text was found in it, even reading it as a picture. Check it's the right file." });
          continue;
        }
        if (used + text.length > LIMITS.knowledgeChars) {
          problems.push({ file: file.name, error: FULL });
          continue;
        }
        used += text.length;
        const source = (await addSource(agentId, { kind: "file", title: file.name, content: text }));
        await queueTraining(source.id);
        added.push(source);
      } catch (error) {
        const message = (error as Error).message;
        problems.push({ file: file.name, error: /^Upload a /.test(message) ? `${message}.` : "It couldn't be opened. Check the file isn't damaged or password-protected." });
      }
    }
    const refreshing = await refreshAfterDocuments(agentId, added.map((s) => s.id));
    return Response.json({ sources: added, problems, refreshing }, { status: added.length ? 201 : 400 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: firstProblem(parsed.error) }, { status: 400 });
  const body = parsed.data;
  if (body.kind === "website") {
    const url = normalUrl(body.url);
    if (!url) return Response.json({ error: "That doesn't look like a website address. Try something like example.com." }, { status: 400 });
    return Response.json({ read: await startSiteRead(agentId, url, { ...(body.maxPages ? { maxPages: body.maxPages } : {}), ...(body.choose ? { choose: true } : {}) }) }, { status: 202 });
  }
  if (body.kind === "text" && used + body.content.length > LIMITS.knowledgeChars) return Response.json({ error: FULL }, { status: 400 });
  const source =
    body.kind === "qa"
      ? await addSource(agentId, { kind: "qa", title: body.question, content: qaText(body.question, body.answer) })
      : await addSource(agentId, { kind: "text", title: body.title, content: body.content });
  await queueTraining(source.id);
  // A text is a document; a Q&A is one answer, and changes nothing in the profile.
  const refreshing = body.kind === "text" && (await refreshAfterDocuments(agentId, [source.id]));
  return Response.json({ sources: [source], refreshing }, { status: 201 });
}
