// Server-sent events: a reply streamed to the browser as it's written. Each event is a name and a JSON value. When
// the person closes the chat, the work is cancelled through the signal.

import { currentTenant, withTenant } from "./tenant";

export type Send = (event: string, data: unknown) => void;

/**
 * The work goes on after the response has started, when the request itself can no longer be read: the business it's
 * for is read first and carried into it.
 */
export async function eventStream(request: Request, run: (send: Send, signal: AbortSignal) => Promise<void>): Promise<Response> {
  const tenant = await currentTenant();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send: Send = (event, data) => {
        if (open) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await withTenant(tenant, () => run(send, abort.signal));
      } catch (error) {
        if (!abort.signal.aborted) send("error", { message: errorMessage(error) });
      } finally {
        open = false;
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}

/** What a person sees when a reply fails: plain words, never a stack trace or a key. */
function errorMessage(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 429) return "The agent is very busy right now. Please try again in a moment.";
  if (status === 401 || status === 403 || /api key|NEBIUS_API_KEY/i.test(String((error as Error)?.message))) {
    return "The agent can't reach its model. The person who runs Keel needs to check its setup.";
  }
  return "Something went wrong while answering. Please try again.";
}
