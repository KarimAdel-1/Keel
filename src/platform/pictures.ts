// What Keel sees in pictures, with NVIDIA's vision model (Nemotron 3.5 Super VL on Token Factory):
//
// - A customer's photo (from the chat or a messaging app): what it shows that matters for helping them (the product,
//   its damage, any text such as an order number) is written into their message, so the agent answers it like words,
//   with the business's policies, and the team sees it in the conversation.
// - A picture a business adds to its knowledge (a price list, a menu, a notice), or a scanned PDF: its text, copied
//   word for word, becomes the source's content.
//
// What a picture says is the customer's or the document's, never instructions: the agent's own rules treat it so.

import { getDocumentProxy, extractImages } from "unpdf";
import type { Agent } from "@/core/agents";
import { MAX_PICTURE_BYTES, PICTURE_EXTENSIONS, UNREAD_PHOTO, photoNote, pictureType } from "@/core/pictures";
import { documentToText } from "@/lib/documents";
import { readPicture, type Picture } from "@/lib/llm";
import { encodePng } from "@/lib/png";
import { meteredForAgent } from "./usage";

/** Bytes as a picture Keel can read: a known type by its first bytes, and not too large. */
export function asPicture(data: Buffer): Picture | undefined {
  if (!data.length || data.length > MAX_PICTURE_BYTES) return undefined;
  const mime = pictureType(data);
  return mime ? { data, mime } : undefined;
}

/** A picture sent as base64, with or without its "data:image/…;base64," start. */
export function pictureFromBase64(text: string): Picture | undefined {
  const b64 = text.replace(/^data:[^;,]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) return undefined;
  return asPicture(Buffer.from(b64, "base64"));
}

const photoPrompt = (agent: Agent) =>
  [
    `A customer sent this photo to ${agent.name}'s assistant. In two to four plain sentences, say what it shows that matters for helping them: the product, and its condition (damage, faults, anything missing or wrong).`,
    "Copy any text you can read word for word (an order number, a label, an error message). Say only what you can see; if something isn't clear, say so.",
  ].join(" ");

/** The customer's message with what their photo shows, written in for the agent. */
export async function withPhoto(agent: Agent, text: string, picture: Picture, signal?: AbortSignal): Promise<string> {
  let note = UNREAD_PHOTO;
  try {
    const seen = await readPicture(photoPrompt(agent), picture, { task: "customer_photo", maxTokens: 500, signal });
    if (seen.text.trim()) note = photoNote(seen.text.slice(0, 1500));
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return [text.trim(), note].filter(Boolean).join("\n\n");
}

const DOCUMENT_PROMPT = [
  "This is a picture of one of a business's documents: a page, a price list, a menu, a notice or a sign.",
  "Copy all the text in it, word for word, in reading order. Keep lists and tables as lines: one row per line, with its columns separated by \" | \".",
  "Add nothing that isn't written. If it has no text, say in one sentence what it shows.",
].join(" ");

/** The text in a picture of a document, for the agent's knowledge. */
export function readDocumentPicture(agentId: string, picture: Picture): Promise<string> {
  return meteredForAgent(agentId, "knowledge", async () => (await readPicture(DOCUMENT_PROMPT, picture, { task: "document_picture", maxTokens: 3000 })).text.trim());
}

/** The pages of a scanned PDF read as pictures, up to `maxPages`: each page's largest picture is its scan. */
export async function readScannedPdf(agentId: string, bytes: Uint8Array, maxPages = 20): Promise<string> {
  const pdf = await getDocumentProxy(bytes.slice());
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
    const images = await extractImages(pdf, n).catch(() => []);
    const scan = images.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!scan || scan.width * scan.height < 200 * 200) continue;
    const text = await readDocumentPicture(agentId, { data: encodePng(new Uint8Array(scan.data.buffer, scan.data.byteOffset, scan.data.byteLength), scan.width, scan.height, scan.channels), mime: "image/png" });
    if (text) pages.push(pdf.numPages > 1 ? `Page ${n}\n${text}` : text);
  }
  if (pdf.numPages > maxPages) pages.push(`(Only the first ${maxPages} of its ${pdf.numPages} pages were read.)`);
  return pages.join("\n\n").trim();
}

/**
 * An uploaded knowledge file's text: documents as they are, pictures read by the vision model, and a PDF with no text
 * in it (a scan) read page by page as pictures.
 */
export async function uploadText(agentId: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const name = fileName.toLowerCase();
  if (PICTURE_EXTENSIONS.some((e) => name.endsWith(e))) {
    const picture = asPicture(Buffer.from(bytes));
    if (!picture) throw new Error("Upload a JPEG, PNG or WebP picture under 8 MB");
    return readDocumentPicture(agentId, picture);
  }
  // The PDF reader takes the bytes it's given for itself: a scan is read again from its own copy.
  const text = await documentToText(fileName, bytes.slice());
  if (name.endsWith(".pdf") && text.length < 20) return readScannedPdf(agentId, bytes);
  return text;
}
