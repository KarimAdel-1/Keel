import { cookies } from "next/headers";
import { endSession } from "@/platform/accounts";
import { SESSION_COOKIE } from "@/platform/session";

export async function POST() {
  const jar = await cookies();
  await endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
