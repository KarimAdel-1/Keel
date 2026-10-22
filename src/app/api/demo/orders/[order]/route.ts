import { demoOrder } from "@/platform/demo-orders";

/** The demo business's order system, made up (src/platform/demo-orders.ts): what a shop's own API would answer. */
export async function GET(_request: Request, { params }: RouteContext<"/api/demo/orders/[order]">) {
  const { status, body } = demoOrder((await params).order);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
