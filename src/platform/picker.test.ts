import { test } from "node:test";
import assert from "node:assert/strict";
import { setTestTenant } from "@/lib/tenant";
import { offline } from "@/testing/live";
import { serveSite } from "@/testing/site";
import { signUp } from "./accounts";
import { learnChosenPages, sectionOf, settled, siteReads, startSiteRead } from "./knowledge/jobs";
import { createAgent, listSources } from "./store";

offline("picker");

const page = (title: string, text: string, links: string[] = []) => ({
  body: `<html><head><title>${title}</title></head><body><main><p>${text.repeat(6)}</p>${links.map((l) => `<a href="${l}">${l}</a>`).join("")}</main></body></html>`,
});

test("sections read the way an owner would name them", () => {
  assert.equal(sectionOf("https://shop.example/help/returns", "https://shop.example/"), "Help");
  assert.equal(sectionOf("https://shop.example/gift-cards/terms", "https://shop.example/"), "Gift cards");
  assert.equal(sectionOf("https://shop.example/about", "https://shop.example/"), "Main pages");
  assert.equal(sectionOf("https://help.shop.example/article/1", "https://shop.example/"), "Help centre");
});

test("choosing pages: Keel finds them without learning any, ticks its picks, and learns only the ones kept", async () => {
  const { workspace } = await signUp({ email: `p${Math.random().toString(36).slice(2)}@example.com`, name: "Pat", password: "long enough" });
  setTestTenant(workspace.id);
  const agent = await createAgent(workspace.id, "Harbor Goods");
  const site = await serveSite({
    "/": page("Harbor Goods", "Homeware made in Cornwall, shipped across the UK. ", ["/help/returns", "/help/shipping", "/news/2026-10-01-our-new-studio-opens-in-the-harbour-this-week"]),
    "/help/returns": page("Returns", "You can return any item within 30 days for a full refund. "),
    "/help/shipping": page("Shipping", "Orders ship within two working days; UK delivery costs four pounds. "),
    "/news/2026-10-01-our-new-studio-opens-in-the-harbour-this-week": page("Our new studio", "We opened a new studio by the harbour this week, come and visit. "),
  });
  try {
    await startSiteRead(agent.id, `${site.url}/`, { choose: true, maxPages: 3 });
    await settled();
    const read = siteReads(agent.id)[0];
    assert.equal(read.status, "found");
    assert.deepEqual(await listSources(agent.id), [], "nothing is learned until the builder chooses");
    const found = read.found!;
    assert.equal(found.length, 4);
    assert.deepEqual(found.filter((p) => p.picked).length, 3, "Keel's picks: as many as would be learned");
    assert.equal(found.find((p) => p.title === "Our new studio")?.picked, false, "news comes last, so it isn't ticked");
    assert.equal(found.find((p) => p.title === "Returns")?.section, "Help");

    const keep = found.filter((p) => p.title !== "Shipping").map((p) => p.url);
    assert.equal(await learnChosenPages("agt_someone_else", read.id, keep), undefined, "another agent can't learn them");
    assert.equal(await learnChosenPages(agent.id, read.id, [...keep, "https://elsewhere.example/"]), 3, "only pages that were found");
    await settled();
    const titles = (await listSources(agent.id)).map((s) => s.title).sort();
    assert.deepEqual(titles, ["Harbor Goods", "Our new studio", "Returns"]);
    assert.equal(siteReads(agent.id)[0].status, "done");
    assert.equal(await learnChosenPages(agent.id, read.id, keep), undefined, "and only once");
  } finally {
    await site.close();
  }
});
