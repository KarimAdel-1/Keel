// Which business (workspace) the current work is for. The database reads it on every query, and Postgres's row-level
// security shows and accepts only that business's rows (src/lib/db.ts), so a missing or wrong check elsewhere can't
// reach another business's data.
//
// Two ways in. A request sets it once access is checked (src/platform/session.ts, or the public routes from the agent
// they serve): it's kept with the request, for every page, component and route of it. Work outside a request (training,
// test runs, schedules, a message from a messaging app) runs inside withTenant().

import { AsyncLocalStorage } from "node:async_hooks";

interface Scope {
  workspaceId?: string;
}

const explicit = new AsyncLocalStorage<Scope>();
const byRequest = new WeakMap<object, Scope>();
/** Tests only: the business a test works as, when nothing else sets one (src/testing/live.ts). */
let testTenant: string | undefined;

/** The scope kept with the current request: the request's headers object is the same for all of it. */
async function requestScope(): Promise<Scope | undefined> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    let scope = byRequest.get(h);
    if (!scope) byRequest.set(h, (scope = {}));
    return scope;
  } catch {
    // Not in a request (the command line, tests, background work started outside one).
    return undefined;
  }
}

/** The business the current work is for, if one is set. */
export async function currentTenant(): Promise<string | undefined> {
  const scope = explicit.getStore();
  if (scope) return scope.workspaceId;
  return (await requestScope())?.workspaceId ?? testTenant;
}

/** Tests only: the business the rest of the test works as (each test file has a database of its own). */
export function setTestTenant(workspaceId: string | undefined): void {
  if (!process.env.NODE_TEST_CONTEXT) throw new Error("setTestTenant() is only for tests.");
  testTenant = workspaceId;
}

/** Sets the business for the rest of this request (or of the withTenant() it runs in), once access to it is checked. */
export async function enterTenant(workspaceId: string): Promise<void> {
  const scope = explicit.getStore() ?? (await requestScope());
  if (!scope) throw new Error("enterTenant() needs a request, or a withTenant() around the work");
  scope.workspaceId = workspaceId;
}

/** Runs work for one business, whatever the request around it (or with none). */
export function withTenant<T>(workspaceId: string | undefined, work: () => Promise<T>): Promise<T> {
  return explicit.run({ workspaceId }, work);
}

/**
 * Work that keeps the business it was started for, wherever it's later run from (a queue, a timer): the business is
 * read now, and set again when it runs.
 */
export async function keepTenant<A extends unknown[], T>(work: (...args: A) => Promise<T>): Promise<(...args: A) => Promise<T>> {
  const workspaceId = await currentTenant();
  return (...args: A) => withTenant(workspaceId, () => work(...args));
}
