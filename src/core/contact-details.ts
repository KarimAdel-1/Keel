// Contact details an agent gives (web addresses, email addresses, phone numbers), checked word for word against what
// the business told it. A judge reading a conversation can miss an invented address ("harborgoods.example" for a shop
// whose information names none), and a customer who follows it lands somewhere else, so this check isn't left to a
// model: a detail is known only when the business's information, or the customer, gave it. Pure functions.

/** Endings a web address is recognised by when it's written without "https://" (most of what customers see). */
const ENDINGS =
  "com|net|org|io|co|ai|app|dev|shop|store|online|site|info|biz|me|tv|uk|ie|de|fr|es|it|nl|be|eu|ch|at|se|no|dk|fi|pl|pt|us|ca|au|nz|in|ae|sa|eg|za|jp|kr|cn|br|mx|example";

const URL = /\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
// Each part before the ending has two letters or more, so "i.e." and "U.S." aren't read as addresses.
const BARE = new RegExp(`(?<![@\\w.-])(?:www\\.)?((?:[a-z0-9-]{2,}\\.)+(?:${ENDINGS}))(?![\\w-])`, "gi");
const EMAIL = /[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
/** A phone number: at least 9 digits, with the spaces, dashes, dots and brackets people write them with. */
const PHONE = /(?<![\w.+])\+?\(?\d[\d\s().-]{7,}\d(?!\d|\.\d)/g;

const host = (h: string) => h.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
const digits = (s: string) => s.replace(/\D/g, "");
/** A phone number's last 9 digits: the same number written with or without its country code. */
const phoneKey = (s: string) => digits(s).slice(-9);

export interface ContactDetails {
  hosts: Set<string>;
  emails: Set<string>;
  phones: Set<string>;
}

/** The web addresses (by host), email addresses and phone numbers in a text. */
export function contactDetails(text: string): ContactDetails {
  const emails = new Set([...text.matchAll(EMAIL)].map((m) => m[0].toLowerCase().replace(/\.$/, "")));
  // An email's domain isn't a web address the agent gave.
  const withoutEmails = text.replace(EMAIL, " ");
  const hosts = new Set([...[...withoutEmails.matchAll(URL)].map((m) => host(m[1])), ...[...withoutEmails.matchAll(BARE)].map((m) => host(m[1]))]);
  const phones = new Set([...withoutEmails.matchAll(PHONE)].map((m) => m[0]).filter((p) => digits(p).length >= 9 && digits(p).length <= 15).map(phoneKey));
  return { hosts, emails, phones };
}

/**
 * The contact details in what the agent said that the known text doesn't contain, as they were written: a web address
 * is known when its site is (a page of a known site is fine), an email when it's there exactly, a phone number when
 * its digits are, with or without the country code.
 */
export function inventedDetails(said: string, known: string): string[] {
  const k = contactDetails(known);
  const knownSite = (h: string) => [...k.hosts, ...[...k.emails].map((e) => e.split("@")[1])].some((x) => h === x || h.endsWith(`.${x}`) || x.endsWith(`.${h}`));
  const out: string[] = [];
  const s = contactDetails(said);
  for (const h of s.hosts) if (!knownSite(h)) out.push(h);
  for (const e of s.emails) if (!k.emails.has(e)) out.push(e);
  for (const p of s.phones) if (!k.phones.has(p)) out.push([...said.matchAll(PHONE)].map((m) => m[0].trim()).find((x) => phoneKey(x) === p) ?? p);
  return out;
}
