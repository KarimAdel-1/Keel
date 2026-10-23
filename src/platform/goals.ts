// Turning an owner's goals (src/core/goals.ts) into the agent's actions and procedures, and reading them back. A goal is
// on when every action it needs is on. Choosing one adds what's missing, reusing what the agent already has (an
// action of the same kind; a form with the same title), and points its procedures at the actions it really uses;
// turning one off switches its actions and procedures off, so nothing the builder wrote is deleted.

import { ACTION_INFO, type Action } from "@/core/actions";
import { GOALS, GOAL_KEYS, INDUSTRY_GOALS, type GoalKey } from "@/core/goals";
import { PROCEDURE_TEMPLATES } from "@/core/procedures";
import type { Industry } from "@/core/agents";
import { createAction, listActions, updateAction } from "./actions";
import { listProcedures, saveProcedure } from "./procedures";

type GoalAction = (typeof GOALS)[GoalKey]["actions"][number];

/** The agent's action that does this part of a goal, if it has one. */
function actionFor(actions: Action[], want: GoalAction): Action | undefined {
  if (want.kind === "form") return actions.find((a) => a.kind === "form" && (a.name === (want.name ?? want.ref) || a.title === want.title));
  return actions.find((a) => a.kind === want.kind && a.name === want.ref) ?? actions.find((a) => a.kind === want.kind);
}

export interface GoalStatus {
  key: GoalKey;
  title: string;
  text: string;
  on: boolean;
}

/** Each goal, and whether the agent does it now. */
export async function goalStatus(agentId: string): Promise<GoalStatus[]> {
  const actions = await listActions(agentId);
  return GOAL_KEYS.map((key) => {
    const goal = GOALS[key];
    return { key, title: goal.title, text: goal.text, on: goal.actions.every((want) => actionFor(actions, want)?.enabled) };
  });
}

/** Sets a goal up (adding what's missing), or switches it off. */
export async function setGoal(agentId: string, key: GoalKey, on: boolean): Promise<void> {
  const goal = GOALS[key];
  const actions = await listActions(agentId);
  const procedures = await listProcedures(agentId);
  if (!on) {
    // Only what no other goal that's on still needs.
    const others = (await goalStatus(agentId)).filter((g) => g.on && g.key !== key).flatMap((g) => GOALS[g.key].actions.map((want) => actionFor(actions, want)?.id));
    for (const want of goal.actions) {
      const action = actionFor(actions, want);
      if (action?.enabled && !others.includes(action.id)) await updateAction(action.id, { enabled: false });
    }
    for (const name of goal.procedures) {
      const p = procedures.find((x) => x.name === name);
      if (p?.enabled) await saveProcedure(agentId, { id: p.id, name: p.name, trigger: p.trigger, steps: p.steps, enabled: false });
    }
    return;
  }
  /** What each @ref in the goal's procedures should call: the agent's own action. */
  const names = new Map<string, string>();
  for (const want of goal.actions) {
    let action = actionFor(await listActions(agentId), want);
    if (!action) action = await createAction(agentId, want.kind, { name: want.name ?? want.ref, ...(want.title ? { title: want.title } : {}), ...(want.description ? { description: want.description } : {}), ...(want.config ? { config: want.config } : {}) });
    else if (!action.enabled) action = (await updateAction(action.id, { enabled: true })) ?? action;
    names.set(want.ref, action.name);
  }
  for (const name of goal.procedures) {
    const template = PROCEDURE_TEMPLATES.find((t) => t.name === name);
    if (!template) continue;
    // The template's other actions (a ticket when a return is outside the window) come along, as the template says.
    for (const need of template.needs) {
      if (names.has(need.name)) continue;
      const have = (await listActions(agentId)).find((a) => a.kind === need.kind);
      names.set(need.name, (have ?? (await createAction(agentId, need.kind, { name: need.name }))).name);
    }
    const steps = template.steps.replace(/@(\w+)/g, (whole, ref: string) => (names.has(ref) ? `@${names.get(ref)}` : whole));
    const existing = procedures.find((p) => p.name === template.name);
    if (!existing) await saveProcedure(agentId, { name: template.name, trigger: template.trigger, steps });
    else if (!existing.enabled) await saveProcedure(agentId, { id: existing.id, name: existing.name, trigger: existing.trigger, steps: existing.steps, enabled: true });
  }
}

/** A new agent starts with what its kind of business usually needs. */
export async function startingGoals(agentId: string, industry: Industry): Promise<void> {
  for (const key of INDUSTRY_GOALS[industry]) await setGoal(agentId, key, true);
}

/** The words for a goal's action in a list ("Live handover, Create a ticket"). */
export const goalActionTitles = (key: GoalKey) => GOALS[key].actions.map((a) => a.title ?? ACTION_INFO[a.kind].title).join(", ");
