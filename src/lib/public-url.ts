// The address Keel is reached at from the outside, for embed codes and share links: KEEL_PUBLIC_URL when it's set,
// otherwise the address of the request being answered.

import { headers } from "next/headers";
import { setting } from "./settings";

export async function publicUrl(): Promise<string> {
  const configured = setting("KEEL_PUBLIC_URL");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
