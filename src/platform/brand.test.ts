import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { brandFromHtml, paletteFromCss, parseColor } from "@/core/brand-extract";
import { signUp } from "./accounts";
import { readBrand, nameFromTitle } from "./knowledge/brand";
import { settled, siteReads, startSiteRead } from "./knowledge/jobs";
import { createAgent, getAgent, updateAgent } from "./store";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { serveSite, type Site } from "@/testing/site";

// Model calls here: only the embeddings that train a site's pages.
const { skip } = live("brand", 10_000);

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f5c63"/><circle cx="32" cy="24" r="7" fill="#f6efe4"/></svg>`;
const HOME = `<!doctype html><html><head><meta name="theme-color" content="#0f5c63"><meta property="og:site_name" content="Harbor Goods">
<link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="https://cdn.elsewhere.example/x.css">
<title>Handmade homeware | Harbor Goods</title><style>.hero { background: #f6efe4 }</style></head>
<body><nav><img class="site-logo" src="/logo.svg" alt="Harbor Goods"></nav><main><p>${"Handmade homeware from coastal makers. ".repeat(10)}</p></main></body></html>`;
const CSS = `:root { --brand-primary: #0f5c63; --accent: #f2a65a; }
a { color: #0f5c63 } .button { background: #0f5c63 } .badge { background: rgb(242, 166, 90) } body { color: #1d1d1b; background: #ffffff } .muted { color: #888 }
.overlay { background: rgba(15, 92, 99, 0.3) }`;

let site: Site;
before(async () => {
  site = await serveSite({
    "/": { body: HOME },
    "/site.css": { body: CSS, type: "text/css" },
    "/logo.svg": { body: LOGO, type: "image/svg+xml" },
  });
});
after(() => site.close());

test("colours: hex, short hex and rgb are read; see-through ones aren't", async () => {
  assert.equal(parseColor("#0F5C63"), "#0f5c63");
  assert.equal(parseColor("#abc"), "#aabbcc");
  assert.equal(parseColor("rgb(242, 166, 90)"), "#f2a65a");
  assert.equal(parseColor("rgba(15, 92, 99, 0.3)"), undefined);
  assert.equal(parseColor("blue"), undefined);
});

test("the palette is the brand colours a site uses most, its theme colour first, never greys or near-white", async () => {
  const palette = paletteFromCss(CSS, "#0f5c63");
  assert.equal(palette[0], "#0f5c63");
  assert.ok(palette.includes("#f2a65a"), "the accent is in it");
  assert.ok(!palette.some((c) => ["#1d1d1b", "#ffffff", "#888888"].includes(c)), "text colours and backgrounds aren't brand colours");
  assert.deepEqual(paletteFromCss("a{color:#0f5c63} b{color:#105d64}"), ["#0f5c63"], "two colours that look the same count once");
});

test("the page names the site, its logo candidates (best first) and only its own stylesheets", async () => {
  const signals = brandFromHtml(HOME, "https://harbor.example/");
  assert.equal(signals.siteName, "Harbor Goods");
  assert.equal(signals.themeColor, "#0f5c63");
  assert.equal(signals.logos[0], "https://harbor.example/logo.svg", "an image called logo comes before the favicon");
  assert.ok(signals.logos.includes("https://harbor.example/favicon.ico"));
  assert.deepEqual(signals.stylesheets, ["https://harbor.example/site.css"]);
  assert.equal(nameFromTitle("Shipping | Harbor Goods", "https://harborgoods.example/"), "Harbor Goods");
  assert.equal(nameFromTitle("Lumen Bank - Everyday banking", "https://lumenbank.example/"), "Lumen Bank");
});

test("the agent's picture: a square icon made for it first, never a logo drawn for dark backgrounds", async () => {
  const html = `<html><head><link rel="apple-touch-icon" sizes="180x180" href="/app-icon.png"><link rel="icon" sizes="32x32" href="/fav-32.png"></head><body><header><img class="logo" src="/Logo-Inverted-160x.webp" alt="Logo"><img class="logo" src="/logo-white.svg"></header><img class="footer-logo" src="/logo-green.png"></body></html>`;
  const { logos } = brandFromHtml(html, "https://fertiliser.example/");
  assert.equal(logos[0], "https://fertiliser.example/app-icon.png", "the square icon made for small round pictures");
  assert.ok(logos.indexOf("https://fertiliser.example/logo-green.png") < logos.indexOf("https://fertiliser.example/Logo-Inverted-160x.webp"), "a coloured logo before an inverted one");
  assert.deepEqual(logos.slice(-2), ["https://fertiliser.example/Logo-Inverted-160x.webp", "https://fertiliser.example/logo-white.svg"], "logos for dark backgrounds come last");
});

test("reading a brand downloads the logo as an inline image and finds the palette", async () => {
  const brand = await readBrand(`${site.url}/`);
  assert.equal(brand.siteName, "Harbor Goods");
  assert.match(brand.logo ?? "", /^data:image\/svg\+xml;base64,/);
  assert.equal(brand.colors[0], "#0f5c63");
  const missing = await readBrand(`${site.url}/no-such-page`);
  assert.deepEqual(missing.colors, [], "a site that can't be read gives an empty brand, not an error");
});

test("reading a website gives the chat the brand's colour and logo, unless the builder already chose their own", { skip }, async () => {
  const { workspace } = await signUp({ email: "brand@example.com", name: "Bea", password: "long enough" });
  setTestTenant(workspace.id);
  const fresh = (await createAgent(workspace.id, "Harbor"));
  await startSiteRead(fresh.id, `${site.url}/`);
  await settled();
  const read = siteReads(fresh.id)[0];
  assert.deepEqual(read.brand?.logo, true, "the read reports a logo, without carrying the image");
  const after = (await getAgent(fresh.id))!;
  assert.equal(after.config.appearance.color, "#0f5c63");
  assert.match(after.config.appearance.avatar ?? "", /^data:image\/svg/);
  assert.equal(after.config.brand.siteName, "Harbor Goods");

  const chosen = (await createAgent(workspace.id, "Harbor 2"));
  await updateAgent(chosen.id, { config: { appearance: { color: "#b42357" } } });
  await startSiteRead(chosen.id, `${site.url}/`);
  await settled();
  assert.equal((await getAgent(chosen.id))!.config.appearance.color, "#b42357", "the builder's own colour is kept");
  assert.deepEqual((await getAgent(chosen.id))!.config.brand.colors[0], "#0f5c63", "and the site's palette is still offered");
});
