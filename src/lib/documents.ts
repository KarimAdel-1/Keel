import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export { MAX_UPLOAD_BYTES } from "@/core/agents";

/** Reads the text out of an uploaded knowledge file: PDF, Word (.docx), Markdown or plain text. */
export async function documentToText(fileName: string, bytes: Uint8Array): Promise<string> {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value.trim();
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".markdown")) {
    return new TextDecoder().decode(bytes).trim();
  }
  throw new Error("Upload a PDF, Word (.docx), Markdown or text file, or a picture");
}
