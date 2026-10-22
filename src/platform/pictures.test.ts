import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHOTO_NOTE, pictureType } from "@/core/pictures";
import { parseMeta, parseTelegram } from "@/lib/messaging";
import { encodePng } from "@/lib/png";
import { setTestTenant } from "@/lib/tenant";
import { live } from "@/testing/live";
import { signUp } from "./accounts";
import { converse } from "./chat/converse";
import { queueTraining, settled } from "./knowledge/jobs";
import { asPicture, pictureFromBase64, uploadText, withPhoto } from "./pictures";
import { addSource, conversationMessages, createAgent } from "./store";

// Model calls here: NVIDIA's vision model reads a customer's photo (twice), a picture of a price list and a scanned
// PDF of it; the agent answers the photo once.
const { skip } = live("pictures", 30_000);

const fixture = (name: string) => readFileSync(new URL(`../testing/fixtures/${name}`, import.meta.url));
const mug = () => asPicture(fixture("broken-mug.png"))!;

async function harbor() {
  const { workspace } = await signUp({ email: `v${Math.random().toString(36).slice(2)}@example.com`, name: "Vic", password: "long enough" });
  setTestTenant(workspace.id);
  return createAgent(workspace.id, "Harbor Goods", { industry: "retail" });
}

test("a picture is known by its first bytes, whatever it's called, and a scan's pixels become a PNG", () => {
  assert.equal(pictureType(fixture("broken-mug.png")), "image/png");
  assert.equal(pictureType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(pictureType(Buffer.from("%PDF-1.7")), undefined, "a PDF isn't a picture");
  assert.equal(pictureFromBase64(`data:image/png;base64,${fixture("broken-mug.png").toString("base64")}`)?.mime, "image/png", "with its data: start or without");
  assert.equal(pictureFromBase64("not base64 at all!"), undefined);
  assert.equal(asPicture(Buffer.alloc(9 * 1024 * 1024, 0xff)), undefined, "too large");

  const pixels = new Uint8Array(3000 * 10 * 3).fill(200);
  const png = encodePng(pixels, 3000, 10, 3);
  assert.equal(pictureType(png), "image/png");
  assert.equal(png.readUInt32BE(16), 1500, "a scan wider than 2000 pixels is halved");
});

test("photos are picked up from Telegram, WhatsApp, Messenger and Instagram messages", () => {
  const telegram = parseTelegram({
    message: { message_id: 7, chat: { id: 42 }, caption: "It arrived like this", photo: [{ file_id: "small", file_size: 1000 }, { file_id: "large", file_size: 90_000 }, { file_id: "huge", file_size: 9_000_000 }] },
  });
  assert.deepEqual([telegram?.text, telegram?.photo], ["It arrived like this", { via: "telegram", fileId: "large" }], "the largest size under 5 MB, with its caption");
  const [whatsapp] = parseMeta({ entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "447700900000", id: "wamid.1", type: "image", image: { id: "media-1", caption: "Broken" } }] } }] }] });
  assert.deepEqual([whatsapp.text, whatsapp.photo], ["Broken", { via: "whatsapp", mediaId: "media-1" }]);
  const [messenger] = parseMeta({ entry: [{ id: "page", messaging: [{ sender: { id: "psid" }, message: { mid: "m.1", attachments: [{ type: "image", payload: { url: "https://cdn.example/photo.jpg" } }] } }] }] });
  assert.deepEqual(messenger.photo, { via: "url", url: "https://cdn.example/photo.jpg" });
});

test("a customer's photo: NVIDIA's vision model says what it shows, and the agent answers it with the business's policy", { skip }, async () => {
  const agent = await harbor();
  await queueTraining(
    (await addSource(agent.id, { kind: "text", title: "Breakages", content: "# Breakages\nIf something arrives broken or faulty, we send a free replacement, or a full refund if you prefer. You don't need to send the broken piece back." })).id,
  );
  await settled();

  const seen = await withPhoto(agent, "", mug());
  assert.match(seen, /^\[The customer sent a photo\. What it shows: /);
  assert.match(seen, /crack|chip|broken|damag/i, `what it saw: ${seen}`);
  assert.equal(seen.replace(PHOTO_NOTE, "").trim(), "", "with no words of the customer's own");

  const turn = await converse({ agent, channel: "widget", message: "My mug arrived like this.", picture: mug() });
  const [asked] = (await conversationMessages(turn.conversationId)).filter((m) => m.role === "user");
  assert.match(asked.content, /^My mug arrived like this\.\n\n\[The customer sent a photo\. What it shows: /, "the team sees what the photo showed");
  assert.match(turn.reply.text, /replace|refund/i, `the agent's answer: ${turn.reply.text}`);
  assert.doesNotMatch(turn.reply.text, /(send|email|upload|share) (us )?(a|the|your) (photo|picture)/i, `it doesn't ask for the photo it has: ${turn.reply.text}`);
});

test("a picture of a price list, and a scanned PDF of it, become knowledge word for word", { skip }, async () => {
  const agent = await harbor();
  const fromPicture = await uploadText(agent.id, "Market prices.png", new Uint8Array(fixture("price-list.png")));
  assert.match(fromPicture, /£18/);
  assert.match(fromPicture, /No refunds on seconds/i);
  const fromScan = await uploadText(agent.id, "Market prices.pdf", new Uint8Array(fixture("scanned-price-list.pdf")));
  assert.match(fromScan, /£18/, "a PDF with no text in it is read as the picture it is");
  assert.match(fromScan, /Tea towel/i);
});
