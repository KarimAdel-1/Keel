import { test } from "node:test";
import assert from "node:assert/strict";
import { membersOf, signUp, workspacesOf } from "./accounts";
import { acceptInvite, createInvite, inviteFor, pendingInvites, removeMember, revokeInvite, signUpWithInvite } from "./invites";
import { LIMITS } from "@/core/limits";
import { setTestTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";

offline("invites");

const email = () => `t${Math.random().toString(36).slice(2)}@example.com`;

test("an invitation link works once: a new person joins the workspace instead of getting their own", async () => {
  const { user: owner, workspace } = await signUp({ email: email(), name: "Olu", password: "long enough" });
  setTestTenant(workspace.id);
  const { token, invite } = await createInvite(workspace.id, "member", owner.id);
  assert.equal((await inviteFor(token))?.workspaceName, workspace.name);
  assert.equal((await pendingInvites(workspace.id)).length, 1);

  const { user } = await signUpWithInvite({ email: email(), name: "Nia", password: "long enough" }, token);
  assert.deepEqual((await workspacesOf(user.id)).map((w) => [w.id, w.role]), [[workspace.id, "member"]], "no workspace of their own, just the invited one");
  assert.equal((await inviteFor(token)), undefined, "used up");
  await assert.rejects(() => signUpWithInvite({ email: email(), name: "Late", password: "long enough" }, token), /has been used/);
  assert.equal((await pendingInvites(workspace.id)).length, 0);
  assert.ok(invite.expiresAt > invite.createdAt);
});

test("someone with an account joins with one click; a withdrawn link and the owner's place are safe", async () => {
  const { user: owner, workspace } = await signUp({ email: email(), name: "Olu", password: "long enough" });
  setTestTenant(workspace.id);
  const { user: guest, workspace: own } = await signUp({ email: email(), name: "Gil", password: "long enough" });
  setTestTenant(workspace.id);
  const { token } = await createInvite(workspace.id, "admin", owner.id);
  await acceptInvite(token, guest.id);
  assert.deepEqual((await workspacesOf(guest.id)).map((w) => w.id).sort(), [own.id, workspace.id].sort(), "they keep their own workspace too");
  assert.equal((await membersOf(workspace.id)).find((m) => m.id === guest.id)?.role, "admin");

  const withdrawn = (await createInvite(workspace.id, "member", owner.id));
  await revokeInvite(workspace.id, withdrawn.invite.id);
  assert.equal((await inviteFor(withdrawn.token)), undefined);

  assert.equal((await removeMember(workspace.id, owner.id)), false, "the owner can't be removed");
  assert.equal((await removeMember(workspace.id, guest.id)), true);
});

test("a workspace can't grow past its limit of people", async () => {
  const { user: owner, workspace } = await signUp({ email: email(), name: "Olu", password: "long enough" });
  setTestTenant(workspace.id);
  for (let i = 1; i < LIMITS.members; i++) await signUpWithInvite({ email: email(), name: `P${i}`, password: "long enough" }, (await createInvite(workspace.id, "member", owner.id)).token);
  assert.equal((await membersOf(workspace.id)).length, LIMITS.members);
  const { token } = await createInvite(workspace.id, "member", owner.id);
  await assert.rejects(() => signUpWithInvite({ email: email(), name: "One more", password: "long enough" }, token), /the most a workspace can have/);
  assert.ok((await inviteFor(token)), "a refused join doesn't use the invitation up");
});
