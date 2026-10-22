import { after, test } from "node:test";
import assert from "node:assert/strict";
import { bareTags, htmlLinks, htmlToText } from "@/core/html";
import { bm25, fuse, terms } from "@/core/search";
import { AccountError, sessionUser, signIn, signUp, startSession, endSession } from "./accounts";
import { addSource, createAgent, listSources, updateAgent } from "./store";
import { trainSource } from "./knowledge/train";
import { closeBrowser } from "@/lib/render";
import { crawlSite, robotsDisallows } from "./knowledge/crawl";
import { inventedDetails } from "@/core/contact-details";
import { renderWidget } from "@/core/widgets";
import { demoOrder, ownDemoOrder } from "./demo-orders";
import { admitsGap, confidenceOf, inPieces, pickModel, plainCitations, reply, saysFallback } from "./chat/answer";
import { visibleStream } from "@/lib/llm";
import type { Passage } from "@/core/agents";
import { compactResult } from "@/core/compact";
import { compactHistory, compressPassages, searchQuery } from "@/core/context";
import { isClear } from "./tests";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { serveSite, type Page } from "@/testing/site";

// Model calls here: one agent learning a short policy and answering a few questions about it.
const { skip } = live("core", 25_000);

const POLICY = `# Returns

Items can be returned within 30 days of delivery for a full refund to the original payment method.

# Shipping

Standard shipping takes 3 to 5 business days and is free on orders over $50.`;

test("core: sign up, create an agent, teach it, and it answers from its knowledge with the source", { skip }, async () => {
  const { workspace } = await signUp({ email: "Owner@Example.com", name: "Sam", password: "correct horse" });
  setTestTenant(workspace.id);
  const agent = (await createAgent(workspace.id, "Harbor Goods", { industry: "retail" }));
  assert.equal(agent.config.model, "super", "new agents use Nemotron 3 Super: the quality-first choice, measured");
  const source = (await addSource(agent.id, { kind: "text", title: "Store policy", content: POLICY }));
  const trained = await trainSource(source.id);
  assert.ok(trained.chunks >= 1);
  assert.equal((await listSources(agent.id))[0].status, "ready");

  const pieces: string[] = [];
  const answer = await reply(agent, [], "How many days do I have to return an item for a refund?", { onText: (p) => pieces.push(p) });
  assert.match(answer.text, /30/);
  assert.ok(answer.citations.some((c) => c.title === "Store policy"), "the answer says where it came from");
  assert.ok(pieces.length > 1, "the reply streams in pieces");

  const again = await reply(agent, [], "how many days do I have to return an item for a refund", { onText: () => {} });
  assert.equal(again.kept, true, "the same opening question is answered from memory");
  assert.equal(again.costUsd, 0);
  assert.equal(again.text, answer.text);
  const changed = (await updateAgent(agent.id, { config: { instructions: `${agent.config.instructions}\nAlways greet warmly.` } }))!;
  const afterChange = await reply(changed, [], "How many days do I have to return an item for a refund?");
  assert.ok(!afterChange.kept, "a changed agent answers afresh");
  const followUp = await reply(changed, [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }], "How many days do I have to return an item for a refund?");
  assert.ok(!followUp.kept, "only opening questions are kept");

  const unknown = await reply(agent, [], "Do you sell gift cards for spaceships?");
  assert.equal(unknown.citations.length, 0, "what it doesn't know, it doesn't pretend to source");
  assert.ok(unknown.confidence < 0.5, "and it isn't confident about it");
});

test("Automatic picks the fast model only for a short question the knowledge clearly answers", async () => {
  const agent = { config: { model: "auto" } } as Parameters<typeof pickModel>[0];
  const q = "How long do refunds take?";
  assert.equal(pickModel(agent, q, { relevance: 0.8 }), "lightning", "a short question the knowledge clearly answers goes to the fast model");
  assert.equal(pickModel(agent, q, { relevance: 0.2 }), "super", "a loose match gets the stronger model");
  assert.equal(pickModel(agent, q, { relevance: 0.5 }), "super", "so does an on-topic question the knowledge doesn't clearly answer (measured: 0.54)");
  assert.equal(pickModel(agent, q, { relevance: 0.5, meaning: false }), "super", "so does a moderate keyword match when the meaning search didn't answer in time");
  assert.equal(pickModel(agent, q, { relevance: 0.7, meaning: false }), "lightning", "a strong keyword match is clear enough");
  assert.equal(pickModel(agent, q, { relevance: 0.8, tools: 3 }), "super", "so do actions to choose from");
  assert.equal(pickModel(agent, q, { relevance: 0.8, procedure: true }), "super", "and a procedure to follow");
  assert.equal(pickModel(agent, "How long do refunds take, and can I also change my delivery address after ordering?", { relevance: 0.8 }), "super", "and several questions at once");
  assert.equal(pickModel({ config: { model: "ultra" } } as Parameters<typeof pickModel>[0], q, { relevance: 0.8 }), "ultra", "a chosen model is always used");
});

test("accounts: passwords are checked, sessions end, and emails are unique", async () => {
  const { user } = await signUp({ email: "lee@example.com", name: "Lee", password: "a long password" });
  assert.equal((await signIn("LEE@example.com ", "a long password")).id, user.id);
  await assert.rejects(() => signIn("lee@example.com", "wrong password"), AccountError);
  await assert.rejects(() => signUp({ email: "lee@example.com", name: "Lee", password: "another one" }), /already an account/);
  await assert.rejects(() => signUp({ email: "new@example.com", name: "", password: "short" }), /at least 8/);
  const { token } = await startSession(user.id);
  assert.equal((await sessionUser(token))?.id, user.id);
  await endSession(token);
  assert.equal((await sessionUser(token)), undefined);
});

test("a modern shop's page: '>' inside attributes and data kept in attributes never leak into the text", async () => {
  const html = `<!DOCTYPE html><html><body><main><div x-show='cart.count > 0' class='mb-3 flex'>Free shipping over $100.</div><div data-collection='{"id": 1, "title": "<b>New</b>", "items": [${'{"n": 1},'.repeat(5000)}{"n": 2}]}'>Returns within 30 days of delivery.</div><p>Sizes run small: if 9 < 10 and 10 > 9, size up.</p></main></body></html>`;
  const { text } = htmlToText(html);
  assert.match(text, /Free shipping over \$100\./);
  assert.match(text, /Returns within 30 days of delivery\./);
  assert.doesNotMatch(text, /class=|x-show|data-collection|"id": 1|DOCTYPE/, `no page code in the text:\n${text.slice(0, 300)}`);
  assert.match(text, /if 9 < 10 and 10 > 9/, "a '<' in the words stays");
  assert.ok(text.length < 200, "a huge attribute adds nothing");
  assert.equal(bareTags("<a title=Don't href='/x'>Go</a>"), "<a>Go</a>", "a quote inside an unquoted value doesn't swallow the page");
  const protectedEmail = htmlToText(`<main><p>Write to <a href="/cdn-cgi/l/email-protection#86efe8f0e3f5f2e9f4a8f4e3eae7f2efe9e8f5c6e8e9f4f2eee0efe3eae2a8e3fee7ebf6eae3"><span class="__cf_email__" data-cfemail="86efe8f0e3f5f2e9f4a8f4e3eae7f2efe9e8f5c6e8e9f4f2eee0efe3eae2a8e3fee7ebf6eae3">[email&#160;protected]</span></a> any time.</p></main>`).text;
  assert.match(protectedEmail, /Write to investor\.relations@northfield\.example any time\./, "an email hidden from harvesters is written out, as visitors see it");
  const hidden = htmlToText(`<main><p>Harbour mug: £18.</p><div v-cloak v-if='false == true' class='hidden md:block'><button>final sale</button><div><span>Final Sale items cannot be returned</span></div></div><p hidden>Old price $80.</p><p style="display: none">Coupon SAVE50.</p><span aria-hidden="true">★★★★★</span><p class="hidden md:block">Shown on larger screens.</p><img hidden src="x.png"><p>Free returns within 30 days.</p></main>`).text;
  assert.match(hidden, /Harbour mug: £18\./);
  assert.match(hidden, /Free returns within 30 days\./);
  assert.doesNotMatch(hidden, /Final Sale|\$80|SAVE50|★/, `what a visitor never sees isn't knowledge:\n${hidden}`);
  assert.match(hidden, /Shown on larger screens/, "a class merely named 'hidden' isn't a hidden element");
  const cut = `<html><head><title>Shoes</title></head><body><main><p>Free returns within 30 days.</p><script>var meta = {"products": [${'{"id": 1, "price": 11000},'.repeat(200)}`;
  const fromCut = htmlToText(cut).text;
  assert.match(fromCut, /Free returns within 30 days\./);
  assert.doesNotMatch(fromCut, /var meta|"price"/, "a page cut off inside a script leaks no code");
});

test("crawl: a site in one language with translated sections is read in its own language", async () => {
  const page = (title: string, lang = "en") => ({ body: `<html lang="${lang}"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${`${title} details. `.repeat(30)}</p></main></body></html>` });
  const pages: Record<string, Page> = {
    "/": { body: `<html lang="en-US"><head><title>Home</title></head><body><main><p>${"We make fertilisers. ".repeat(20)}</p><a href="/products/">Products</a><a href="/ar/products/">المنتجات</a><a href="/fr/products/">Produits</a><a href="/en-gb/products/">Products UK</a><a href="/us/contact/">US contact</a><a href="/investor-relations/dividend-policy/">Dividends</a><a href="/contact-us/thank-you/">Thanks</a></main></body></html>` },
    "/products/": page("Products"),
    "/ar/products/": page("المنتجات", "ar"),
    "/fr/products/": page("Produits", "fr"),
    "/en-gb/products/": page("Products UK"),
    "/us/contact/": page("US contact"),
    "/investor-relations/dividend-policy/": page("Dividend policy"),
    "/contact-us/thank-you/": page("Thank you"),
  };
  const site = await serveSite(pages);
  try {
    // Home, the two product pages and the contact page fill the read; what comes last doesn't get a turn.
    const { pages: read } = await crawlSite(`${site.url}/`, { maxPages: 4 });
    const titles = read.map((p) => p.title);
    assert.ok(!titles.includes("المنتجات") && !titles.includes("Produits"), `translations are left out: ${titles.join(", ")}`);
    assert.ok(titles.includes("Products") && titles.includes("Products UK") && titles.includes("US contact"), `the site's own language and its country sections are read: ${titles.join(", ")}`);
    assert.ok(!titles.includes("Dividend policy") && !titles.includes("Thank you"), `investor pages and thank-you pages come last: ${titles.join(", ")}`);
  } finally {
    await site.close();
  }
});

test("crawl: news and investor pages only fill a small share, and a form's thank-you page is never read", async () => {
  const page = (title: string) => ({ body: `<html lang="en"><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${`${title} details. `.repeat(30)}</p></main></body></html>` });
  const news = [
    ...Array.from({ length: 7 }, (_, i) => `/newsroom/company-announces-result-${i}/`),
    ...Array.from({ length: 7 }, (_, i) => `/company-reports-q${i}-2024-revenues-of-496-million-and-strong-growth/`),
  ];
  const pages: Record<string, Page> = {
    "/": { body: `<html lang="en"><head><title>Home</title></head><body><main><p>${"We make ammonia. ".repeat(20)}</p>${[...news, "/products/", "/contact-us/", "/contact-us/thank-you-for-submitting-your-inquiry/"].map((h) => `<a href="${h}">${h}</a>`).join("")}</main></body></html>` },
    "/products/": page("Products"),
    "/contact-us/": page("Contact us"),
    "/contact-us/thank-you-for-submitting-your-inquiry/": page("Thank you"),
    ...Object.fromEntries(news.map((p, i) => [p, page(`News ${i}`)])),
  };
  const site = await serveSite(pages);
  try {
    const { pages: read } = await crawlSite(`${site.url}/`, { maxPages: 30 });
    const titles = read.map((p) => p.title);
    assert.ok(titles.includes("Products") && titles.includes("Contact us"));
    assert.ok(titles.filter((t) => t.startsWith("News")).length <= 8, `news fills a small share: ${titles.join(", ")}`);
    assert.ok(!titles.includes("Thank you") && !site.asked.some((p) => p.includes("thank-you")), "a thank-you page isn't even asked for");
  } finally {
    await site.close();
  }
});

test("crawl: help pages first, a few pages per folder, and never a page that says it isn't there", async () => {
  const words = (topic: string) => `${topic} `.repeat(60);
  const page = (title: string, body: string, links = "") => ({ body: `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p>${links}</main></body></html>` });
  const stores = ["a", "b", "c", "d", "e", "f"].map((x) => `/pages/stores/stockist-${x}`);
  const pages: Record<string, Page> = {
    "/": page("Home", words("Shoes for walking."), [...stores, "/pages/careers", "/pages/missing", "/pages/help", "/pages/returns-exchanges"].map((h) => `<a href="${h}">${h}</a>`).join("")),
    "/pages/help": page("Help", words("Email us any time.")),
    "/pages/returns-exchanges": page("Returns", words("Returns within 30 days.")),
    "/pages/careers": page("Careers", words("Join our team.")),
    "/pages/missing": page("Page Not Found", words("Sorry, this page isn't here.")),
    ...Object.fromEntries(stores.map((p) => [p, page(`Stockist ${p.slice(-1)}`, words("A shop that sells our shoes."))])),
  };
  const site = await serveSite(pages);
  try {
    const { pages: read } = await crawlSite(`${site.url}/`, { maxPages: 7 });
    const titles = read.map((p) => p.title);
    assert.ok(titles.includes("Help") && titles.includes("Returns"), `help pages are read first: ${titles.join(", ")}`);
    assert.ok(!titles.includes("Page Not Found"), "a page that says it isn't there is no knowledge");
    assert.ok(titles.filter((t) => t.startsWith("Stockist")).length <= 4, `one folder doesn't fill the read: ${titles.join(", ")}`);
    assert.ok(!titles.includes("Careers") || titles.length === 7, "careers come last");
  } finally {
    await site.close();
  }
});

test("a field shown as a label box and a value box stays one line, so values can't slip to the wrong label", async () => {
  const box = (label: string, value: string) => `<div class="row"><div class="w"><div class="c"><p class="t">${label}</p></div></div><div class="w"><div class="c"><p class="t">${value}</p></div></div></div>`;
  const html = `<main><div><div><h3>Adelaide (ADE)</h3></div><div><p>OSR</p></div></div>${box("Loading Clearance", "4.3m")}${box("UHF Channel", "28")}<div><p>Our team loads every truck by hand. We open early.</p><p>Bring your booking number.</p></div><dl><dt>Minimum order</dt><dd>25 tonnes</dd><dt>Payment</dt><dd>30 days</dd></dl></main>`;
  const { text } = htmlToText(html);
  assert.match(text, /^Loading Clearance: 4\.3m$/m);
  assert.match(text, /^UHF Channel: 28$/m);
  assert.match(text, /^### Adelaide \(ADE\)$/m, "a heading stays a heading");
  assert.match(text, /^Minimum order: 25 tonnes$/m);
  assert.match(text, /^Payment: 30 days$/m);
  assert.doesNotMatch(text, /Our team loads every truck by hand\. We open early\.: /, "sentences aren't labels");
});

test("crawl: a site that's busy for a moment is asked again; one that stays busy says so plainly", async () => {
  let asked = 0;
  const pages: Record<string, Page> = {};
  Object.defineProperty(pages, "/", { enumerable: true, get: () => (++asked === 1 ? { status: 429, body: "slow down" } : { body: `<html><body><main><p>${"We repair bikes. ".repeat(20)}</p></main></body></html>` }) });
  const once = await serveSite(pages);
  const busy = await serveSite({ "/": { status: 429, body: "slow down" } });
  try {
    const { pages: read } = await crawlSite(`${once.url}/`, { render: false });
    assert.equal(read.length, 1, "read on the second try");
    assert.equal((await crawlSite(`${busy.url}/`, { render: false })).problem, "busy");
  } finally {
    await once.close();
    await busy.close();
  }
});

test("crawl: the start page, the sitemap's pages and links on the same site, never what robots.txt disallows", async () => {
  const pages: Record<string, Page> = {};
  const site = await serveSite(pages);
  Object.assign(pages, {
    "/robots.txt": { body: "User-agent: *\nDisallow: /admin\n", type: "text/plain" },
    "/sitemap.xml": { body: `<urlset><url><loc>${site.url}/faq</loc></url></urlset>`, type: "application/xml" },
    "/": { body: `<html><head><title>Home</title></head><body><nav>Menu</nav><main><h1>Welcome</h1><p>${"We sell kettles and teapots. ".repeat(10)}</p><a href="/shipping">Shipping</a><a href="/admin">Admin</a><a href="https://other.example/x">Elsewhere</a></main></body></html>` },
    "/faq": { body: `<html><head><title>FAQ</title></head><body><main><h2>Returns</h2><p>${"Returns are free within 30 days. ".repeat(10)}</p></main></body></html>` },
    "/shipping": { body: `<html><head><title>Shipping</title></head><body><main><p>${"Shipping takes 3 to 5 days. ".repeat(10)}</p></main></body></html>` },
    "/admin": { body: "<html><body><main>secret</main></body></html>" },
  });
  try {
    const { pages: read } = await crawlSite(`${site.url}/`);
    assert.deepEqual(read.map((p) => p.title).sort(), ["FAQ", "Home", "Shipping"]);
    assert.ok(!read.some((p) => p.text.includes("secret")));
    assert.ok(!site.asked.includes("/admin"), "a page robots.txt disallows is never even asked for");
    assert.ok(!read[0].text.includes("Menu"), "navigation isn't knowledge");
  } finally {
    await site.close();
  }
  assert.deepEqual(robotsDisallows("User-agent: other\nDisallow: /x\nUser-agent: *\nDisallow: /private\n"), ["/private"]);
});

test("crawl a live-style site: redirects, sitemap indexes, robots wildcards, structured data, and plain reasons when it can't", async () => {
  const product = { "@context": "https://schema.org", "@type": "Product", name: "Stoneware mug", offers: { "@type": "Offer", price: "28.00", priceCurrency: "GBP", availability: "https://schema.org/InStock" } };
  const business = { "@type": "LocalBusiness", name: "Harbor Goods", telephone: "+44 20 7946 0000", openingHours: "Mo-Sa 09:00-18:00" };
  const page = (title: string, body: string, head = "") => `<html><head><title>${title}</title>${head}</head><body><main>${body}</main></body></html>`;
  const filler = (s: string) => `<p>${`${s} `.repeat(12)}</p>`;
  const pages: Record<string, Page> = {};
  const site = await serveSite(pages, { fromLocalhost: true });
  Object.assign(pages, {
    "/": { body: page("Home", `${filler("Handmade homeware from the coast.")}<a href="/faq?utm_source=nav">FAQ</a><a href="/cart">Cart</a><a href="/products/mug">Mug</a><a href="/private/notes">Notes</a><a href="/private/public-info">Info</a>`, `<script type="application/ld+json">${JSON.stringify(business)}</script>`) },
    "/robots.txt": { body: `User-agent: *\nDisallow: /private/\nAllow: /private/public-*\nDisallow: /*?sort=\nSitemap: ${site.url}/sitemap_index.xml\n`, type: "text/plain" },
    "/sitemap_index.xml": { body: `<sitemapindex><sitemap><loc>${site.url}/sitemap-pages.xml</loc></sitemap></sitemapindex>`, type: "application/xml" },
    "/sitemap-pages.xml": { body: `<urlset><url><loc>${site.url}/shipping</loc></url><url><loc>${site.url}/list?sort=price</loc></url></urlset>`, type: "application/xml" },
    "/faq": { body: page("FAQ", filler("Returns are free within 30 days.")) },
    "/shipping": { status: 301, location: "/shipping/" },
    "/shipping/": { body: new Uint8Array([...new TextEncoder().encode(`<html><head><meta charset="iso-8859-1"><title>Shipping</title></head><body><main><p>UK delivery costs `), 0xa3, ...new TextEncoder().encode(`4, and it is free over 50. ${"Orders ship in two days. ".repeat(10)}</p></main></body></html>`)]), type: "text/html" },
    "/products/mug": { body: page("Stoneware mug", "<p>A short page.</p>", `<script type="application/ld+json">${JSON.stringify({ "@graph": [product] })}</script><meta name="description" content="A wheel-thrown stoneware mug that holds 350 ml, glazed by hand in our studio, dishwasher and microwave safe, made to last for years of morning coffee and evening tea.">`) },
    "/private/public-info": { body: page("Public info", filler("Our studio is open to visitors on Saturdays.")) },
    "/private/notes": { body: page("Notes", "secret") },
    "/list?sort=price": { body: page("Sorted", "sorted list") },
  });
  try {
    // Asked as "localhost", the site redirects to its real address: it's read where it really lives.
    const result = await crawlSite(`${site.other}/`);
    assert.equal(result.finalUrl, `${site.url}/`, "the site is read where it really lives");
    const byTitle = Object.fromEntries(result.pages.map((p) => [p.title, p.text]));
    assert.deepEqual(Object.keys(byTitle).sort(), ["FAQ", "Home", "Public info", "Shipping", "Stoneware mug"]);
    assert.match(byTitle.Shipping, /costs £4/, "a page in another character set reads correctly");
    assert.match(byTitle["Stoneware mug"], /Price: 28\.00 GBP, in stock/, "prices kept in structured data become knowledge");
    assert.match(byTitle.Home, /Opening hours: Mo-Sa 09:00-18:00/);
    assert.ok(!result.pages.some((p) => /secret|sorted list/.test(p.text)), "robots.txt rules, wildcards included, are respected");
  } finally {
    await site.close();
  }

  // Sites that can't be read say why, in plain words.
  const guarded = await serveSite({ "/": { status: 403, body: "<html><head><title>Just a moment...</title></head></html>" } });
  const app = await serveSite({ "/": { body: '<html><head><title>App</title><script src="/a.js"></script></head><body><div id="root"></div></body></html>' } });
  const closed = await serveSite({ "/robots.txt": { body: "User-agent: *\nDisallow: /", type: "text/plain" }, "/": { body: page("Home", filler("hello")) } });
  try {
    assert.equal((await crawlSite(`${guarded.url}/`, { render: false })).problem, "blocked");
    assert.equal((await crawlSite(`${app.url}/`, { render: false })).problem, "needs_javascript");
    assert.equal((await crawlSite(`${closed.url}/`, { render: false })).problem, "robots");
  } finally {
    await Promise.all([guarded.close(), app.close(), closed.close()]);
  }
});

after(closeBrowser);

test("a site built by JavaScript is read in a headless browser that fetches only through Keel's guard", async () => {
  const site = await serveSite({
    "/": { body: '<html><head><title>Ferry Times</title><script defer src="/app.js"></script></head><body><div id="root"></div></body></html>' },
    "/app.js": { body: `document.getElementById("root").innerHTML = "<main><h1>Timetable</h1><p>${"Ferries leave the harbour every hour from 7am to 9pm, and the crossing takes 40 minutes. ".repeat(4)}</p><a href='/fares'>Fares</a></main>";`, type: "application/javascript" },
    "/fares": { body: '<html><head><title>Fares</title><script defer src="/fares.js"></script></head><body><div id="root"></div></body></html>' },
    "/fares.js": { body: `document.getElementById("root").innerHTML = "<main><p>${"An adult return costs 12 pounds and children travel free. ".repeat(5)}</p></main>";`, type: "application/javascript" },
  });
  try {
    const result = await crawlSite(`${site.url}/`, { maxPages: 5 });
    assert.equal(result.problem, undefined);
    assert.deepEqual(result.pages.map((p) => p.title).sort(), ["Fares", "Ferry Times"]);
    assert.match(result.pages.find((p) => p.title === "Fares")!.text, /adult return costs 12 pounds/);
    assert.ok(site.asked.includes("/app.js"), "the page's scripts came through Keel's own fetching");
  } finally {
    await site.close();
  }
});

test("html: headings, lists and tables survive as text; links come back absolute", async () => {
  const { title, text } = htmlToText("<html><head><title>A &amp; B</title><style>x{}</style></head><body><main><h2>Fees</h2><ul><li>One</li><li>Two</li></ul><table><tr><td>Plan</td><td>$5</td></tr></table></main></body></html>");
  assert.equal(title, "A & B");
  assert.match(text, /## Fees/);
  assert.match(text, /- One\n- Two/);
  assert.match(text, /Plan \| \$5/);
  assert.deepEqual(htmlLinks('<a href="/a#x">a</a><a href="mailto:x@y.z">m</a>', "https://s.example/p"), ["https://s.example/a"]);
});

test("search: keywords rank exact matches first, and fused rankings favour what both agree on", async () => {
  const docs = [terms("Standard shipping takes 3 to 5 days"), terms("Returns within 30 days for a refund"), terms("Order PW-1043 status")];
  const scores = bm25("refund return days", docs);
  assert.ok(scores[1] > scores[0] && scores[1] > scores[2]);
  assert.ok(bm25("PW-1043", docs)[2] > 0, "codes are matched whole");
  assert.deepEqual(fuse([[1, 0, 2], [1, 2]]).slice(0, 2), [1, 2]);
});

test("context: nothing that fits is cut; passages and the conversation are trimmed only past their budget", async () => {
  const passage = (n: number, text: string): Passage => ({ chunkId: n, sourceId: `src_${n}`, title: `Page ${n}`, text });
  const passages = [
    passage(1, "Returns are accepted within 30 days of delivery."),
    passage(2, "Refunds go to the original payment method within 5 business days."),
    passage(3, "# Shipping\nWe ship to 40 countries. Express shipping costs $15.\nOrders over $50 ship free.\nOur warehouse is in Rotterdam. It was founded in 1998 by two sisters who loved ceramics."),
    passage(4, "Returns are accepted within 30 days of delivery. Returns are free."),
    passage(5, "Gift cards never expire. They can be used online and in our shop."),
  ];
  // Within the budget, every passage stays whole: an answer worded differently from the question is never cut.
  const roomy = compressPassages("Is there a way to put a little message with a present?", [...passages, passage(6, "Gift wrapping costs £3 per item and includes a handwritten note.")]);
  assert.ok(roomy.some((p) => p.text.includes("handwritten note")), "the answer that shares no word with the question stays");
  assert.equal(roomy.find((p) => p.chunkId === 3)?.text, passages[2].text, "and passages that fit aren't trimmed");

  // Past the budget, the least relevant are cut down to what matches, then dropped from the bottom.
  const kept = compressPassages("How much is express shipping?", passages, { budget: 260 });
  const shipping = kept.find((p) => p.chunkId === 3)!;
  assert.match(shipping.text, /Express shipping costs \$15/, "the sentence that answers stays");
  assert.match(shipping.text, /# Shipping/, "with the heading it sits under");
  assert.doesNotMatch(shipping.text, /founded in 1998/, "unrelated sentences go");
  assert.ok(!kept.some((p) => p.chunkId === 5), "a passage with nothing on the question goes");
  assert.ok(kept.some((p) => p.chunkId === 1) && kept.some((p) => p.chunkId === 2), "the best ones stay whole");
  const returns = compressPassages("Can I return it?", passages);
  assert.equal(returns.find((p) => p.chunkId === 4)?.text, "Returns are free.", "a sentence an earlier passage already says goes; a new fact stays, even when its words appear elsewhere");

  assert.equal(searchQuery("And how long does that take?", [{ role: "user", content: "Can I get a refund on a mug?" }]), "And how long does that take?\nCan I get a refund on a mug?", "a follow-up searches with what it refers to");
  assert.equal(searchQuery("What is your refund policy for items bought on sale during the holidays?", [{ role: "user", content: "Hi" }]), "What is your refund policy for items bought on sale during the holidays?");

  // The conversation stays word for word while it fits; past the budget, the oldest are shortened first.
  const chat = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `Message ${i}. My order number is HG-${1000 + i}. ${"word ".repeat(80)}` }));
  assert.deepEqual(compactHistory(chat), chat, "a conversation that fits is kept whole: nothing said earlier is lost");
  const tight = compactHistory(chat, { maxChars: 3000 });
  assert.deepEqual(tight.slice(-6), chat.slice(-6), "past the budget, the last six messages stay word for word");
  assert.ok(tight.slice(0, -6).every((t) => t.content.length <= 321), "and older ones are shortened");
  assert.match(tight[0].content, /HG-100\d/, "keeping what they began with");
});

test("judging: a clear verdict from the first judge stands; an unclear one goes to the careful judge", async () => {
  assert.ok(isClear({ passed: true, score: 92 }));
  assert.ok(isClear({ passed: false, score: 10 }));
  assert.ok(!isClear({ passed: true, score: 60 }), "a weak pass is checked again");
  assert.ok(!isClear({ passed: false, score: 55 }), "a near miss is checked again");
});

test("search terms keep how often a word occurs, short words like UK, and every language", async () => {
  assert.deepEqual(terms("UK delivery, delivery and delivery"), ["uk", "delivery", "delivery", "delivery"]);
  assert.ok(terms("Livraison gratuite à partir de 50 €").includes("livraison"), "accented words count");
  assert.ok(terms("التوصيل مجاني").includes("التوصيل"), "so do other scripts");
  assert.ok(terms("Order PW-1043").includes("pw-1043"), "codes stay whole");
  const shipping = "Standard UK delivery takes 3 to 5 days. Express delivery is next day. International delivery takes longer.";
  const returns = "Return any item within 30 days of delivery. UK returns are free.";
  const [a, b] = bm25("How long does UK delivery take?", [terms(shipping), terms(returns)]);
  assert.ok(a > b, "the passage about delivery ranks above one that mentions it once");
});

test("action results reach the model compact, with every value kept", async () => {
  const raw = { order: { number: "HG-1043", status: "shipped", notes: null, items: [{ sku: "MUG-350", name: "Stoneware mug, 350 ml", qty: 2 }, { sku: "BWL-B", name: "Breakfast bowl", qty: 1 }], events: [] }, tell_the_customer: "It's on its way." };
  const text = compactResult(JSON.stringify(raw));
  for (const value of ["HG-1043", "shipped", "MUG-350", '"Stoneware mug, 350 ml"', "Breakfast bowl", "It's on its way."]) assert.ok(text.includes(value), `keeps ${value}`);
  assert.match(text, /items\[2\] \(sku, name, qty\):/, "a list of records becomes a table");
  assert.doesNotMatch(text, /notes|events/, "empty fields are left out");
  assert.ok(text.length < JSON.stringify(raw).length);
  const long = compactResult(JSON.stringify({ rows: Array.from({ length: 50 }, (_, i) => ({ id: i, ok: true })) }));
  assert.match(long, /… 30 more/, "a long list says how much was left out");
  assert.equal(compactResult("plain text"), "plain text");
});

test("a reworded \"don't know\" counts as one, and a loose match is never shown as confident", () => {
  const fallback = "I'm not sure about that one. Could you rephrase it, or would you like me to connect you with someone from the team?";
  assert.ok(saysFallback(fallback, fallback, false, false), "word for word");
  assert.ok(saysFallback("I'm not sure about that one. Would you like me to connect you with someone from our team?", fallback, false, false), "reworded");
  assert.ok(!saysFallback("Returns are free within 30 days [1].", fallback, true, false), "a cited answer isn't one");
  assert.ok(confidenceOf({ fellBack: false, cited: false, relevance: 0.41, meaning: true, usedAction: false }) < 0.35, "an unrelated question's meaning score adds nothing");
  assert.ok(confidenceOf({ fellBack: false, cited: true, relevance: 0.75, meaning: true, usedAction: false }) > 0.95, "a cited answer to a clear match is confident");
  const partial = "Northfield Agri exports urea worldwide [1]. I don’t have specific minimum order quantities or payment terms for Kenya: please contact the sales team.";
  assert.ok(admitsGap(partial) && !admitsGap("Returns are free within 30 days [1]."));
  assert.equal(plainCitations("Matched to your risk level【1†L30-L33】 and goals ［2］."), "Matched to your risk level[1] and goals [2].");
  assert.ok(admitsGap("I’m sorry, but the information I have does not include the minimum order quantity for Kenya."));
  assert.ok(!admitsGap("The price does not include VAT [2]."), "a fact about what something includes isn't a gap");
  assert.ok(confidenceOf({ fellBack: false, cited: true, relevance: 0.75, meaning: true, usedAction: false, admitsGap: true }) < 0.5, "an answer that says it doesn't know part of the question is one to look at, whatever it cites");
  assert.ok(confidenceOf({ fellBack: false, cited: false, relevance: 0.6, usedAction: false, admitsGap: true }) < 0.35, "\"I'm not sure about that\" with nothing cited is a question nothing answered");
});

test("the demo's order system answers like a shop's, on this server without the network, and its tracker shows where the order is", () => {
  const found = demoOrder("hg-1043") as { status: number; body: { status: string; steps: string[] } };
  assert.equal(found.status, 200);
  assert.equal(found.body.status, "Shipped");
  assert.equal(demoOrder("HG-9999").status, 404);
  assert.equal(ownDemoOrder("http://localhost:3000/api/demo/orders/HG-1043")?.status, 200, "Keel's own address is answered in the same process");
  assert.equal(ownDemoOrder("https://elsewhere.example/api/demo/orders/HG-1043"), undefined, "another server's address goes out as usual");
  assert.deepEqual(renderWidget({ template: "tracker", mapping: { title: "title", steps: "steps", current: "status" } }, found.body), { type: "tracker", title: "Order HG-1043", steps: ["Ordered", "Packed", "Shipped", "Delivered"], current: 2 });
});

test("contact details the business never gave are caught word for word: a judge once missed an invented web address", () => {
  const known = "Email hello@harbor.example. Phone: 01632 960418. Its website: https://harbor.example. Studio: 4 Quay Row, St Brannoc.";
  assert.deepEqual(inventedDetails("Gift cards work online at harborgoods.example and in the studio shop.", known), ["harborgoods.example"], "the address the agent made up");
  assert.deepEqual(inventedDetails("See www.harbor.example/returns, email hello@harbor.example or call +44 1632 960418.", known), [], "a page of a known site, and a known number with its country code");
  assert.deepEqual(inventedDetails("Write to sales@harbor.example or call 020 7946 0000.", known), ["sales@harbor.example", "020 7946 0000"]);
  assert.deepEqual(inventedDetails("We don't ship to the U.S., i.e. only the UK and EU: 3 to 5 days, £4.95, 140 × 240 cm, order 124589, on 2026-10-21.", known), [], "abbreviations, prices, sizes, order numbers and dates aren't contact details");
});

test("what streams to the customer is what's kept: no reasoning traces, no blank start or end, nothing lost", async () => {
  const watch = (pieces: string[]) => {
    const seen: string[] = [];
    const stream = visibleStream((p) => seen.push(p));
    for (const p of pieces) stream.push(p);
    const kept = stream.end();
    assert.equal(seen.join(""), kept, `streamed and kept differ for ${JSON.stringify(pieces)}`);
    return kept;
  };
  assert.equal(watch(["\n\n", "Yes, we ship ", "abroad [1].", "\n"]), "Yes, we ship abroad [1].");
  assert.equal(watch(["<thi", "nk>Let me check the", " passages.</th", "ink>\n\nReturns are free."]), "Returns are free.", "a trace split across pieces never shows");
  assert.equal(watch(["Price: ", "<", "b>£5</b>"]), "Price: <b>£5</b>", "a tag that isn't a trace is shown in full");
  assert.equal(watch(["The cost is", " £5"]), "The cost is £5", "the space between pieces stays");

  const text = "First paragraph.\n\nSee https://example.com/a/very/long/path/to/the/returns-policy for details.";
  assert.equal(inPieces(text).join(""), text, "pieces of a reply lose no blank line and no part of a long link");
  assert.ok(inPieces(text).length > 2);
});
