// Pictures Keel reads with NVIDIA's vision model (src/lib/llm.ts readPicture): a photo a customer sends, and pictures
// and scanned pages a business adds to its knowledge. Pure definitions and checks.

/** The picture types Keel takes, as browsers and messaging apps send them. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type PictureType = (typeof PICTURE_TYPES)[number];

/** The largest picture Keel reads (a phone photo is 2 to 5 MB; the chat shrinks its own first). */
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;

/** Picture files a business can add to its knowledge. */
export const PICTURE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

/** What a file's first bytes say it is, whatever its name or the type it was sent as. */
export function pictureType(data: Uint8Array): PictureType | undefined {
  const starts = (...bytes: number[]) => bytes.every((b, i) => data[i] === b);
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "image/webp";
  return undefined;
}

/** How a customer's photo is written into their message, for the agent and in the conversation's record. */
export const PHOTO_MARK = "[The customer sent a photo";
export const photoNote = (shows: string) => `${PHOTO_MARK}. What it shows: ${shows.trim()}]`;
export const UNREAD_PHOTO = `${PHOTO_MARK}, which couldn't be read. Ask them to describe it in words.]`;

/** The photo notes in a message, for showing the customer's own words without them. */
export const PHOTO_NOTE = /\s*\[The customer sent a photo[^\]]*\]/g;

// Each verb is checked on its own (the photo is looked ahead for, not taken), so "no need to send the piece back; just
// email a photo" is still caught by its second verb.
const PHOTO_REQUEST = /\b(?:e-?mail|send|share|attach|upload|forward)\b(?=[^.!?;\n]{0,40}?\b(?:photo|picture|image|pic)s?\b)/gi;
const NO_NEED = /(?:no need to|n['’]t need to|not need to|n['’]t have to|needn['’]t)\s*$/i;

/** A reply that asks the customer for a photo ("email a photo of it", "send us a picture"), not one that says there's no need. */
export function asksForPhoto(text: string): boolean {
  return [...text.matchAll(PHOTO_REQUEST)].some((m) => !NO_NEED.test(text.slice(Math.max(0, m.index - 30), m.index)));
}
