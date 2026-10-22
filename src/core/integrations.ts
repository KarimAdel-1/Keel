// Integrations: where an agent meets customers besides the website (messaging apps), and the tools a business already
// uses for support (its helpdesk, its team chat). Each is connected per agent, with the business's own keys, which are
// kept sealed. Pure definitions; connecting, receiving and sending is src/platform/integrations.ts.

export const MESSAGING_KINDS = ["whatsapp", "messenger", "instagram", "telegram"] as const;
export const SUPPORT_KINDS = ["slack", "zendesk", "freshdesk"] as const;
export const INTEGRATION_KINDS = [...MESSAGING_KINDS, ...SUPPORT_KINDS] as const;
export type MessagingKind = (typeof MESSAGING_KINDS)[number];
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const isMessaging = (kind: IntegrationKind): kind is MessagingKind => (MESSAGING_KINDS as readonly string[]).includes(kind);

export interface IntegrationField {
  key: string;
  label: string;
  /** Where to find it, in a few words. */
  help: string;
  /** Kept sealed, and shown masked once saved. */
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
  choices?: { value: string; label: string }[];
}

export interface IntegrationInfo {
  title: string;
  /** What it does for the business, in a sentence. */
  text: string;
  group: "Messaging apps" | "Your support tools";
  fields: IntegrationField[];
  /** How to set it up, step by step, in the business owner's words. */
  steps: string[];
  /** Whether the platform calls Keel back (a webhook address the business pastes into the platform). */
  webhook: boolean;
}

/** What the page shows while a field is saved: a secret is never sent back. */
export const SECRET_MASK = "••••••••";

export const INTEGRATION_INFO: Record<IntegrationKind, IntegrationInfo> = {
  whatsapp: {
    title: "WhatsApp",
    text: "Customers message your WhatsApp Business number and the agent answers them there; your team can take over from the Helpdesk.",
    group: "Messaging apps",
    webhook: true,
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", help: "Meta app › WhatsApp › API setup, under your number", placeholder: "123456789012345" },
      { key: "accessToken", label: "Access token", help: "A permanent token for a system user with WhatsApp access (Business settings › System users)", secret: true },
      { key: "appSecret", label: "App secret", help: "Meta app › App settings › Basic", secret: true },
    ],
    steps: [
      "In Meta for Developers, create an app of type Business and add the WhatsApp product.",
      "Add your business phone number in WhatsApp › API setup, and copy its Phone number ID here.",
      "Create a permanent access token for a system user with the whatsapp_business_messaging permission, and paste it here.",
      "Copy the App secret from App settings › Basic.",
      "Save, then in WhatsApp › Configuration paste Keel's webhook address and verify token below, and subscribe to messages.",
    ],
  },
  messenger: {
    title: "Facebook Messenger",
    text: "People who message your Facebook Page get answers from the agent in Messenger.",
    group: "Messaging apps",
    webhook: true,
    fields: [
      { key: "pageId", label: "Page ID", help: "Your Facebook Page › About › Page transparency, or Meta Business Suite", placeholder: "104857600000000" },
      { key: "pageAccessToken", label: "Page access token", help: "Meta app › Messenger › Settings › Generate token for your Page", secret: true },
      { key: "appSecret", label: "App secret", help: "Meta app › App settings › Basic", secret: true },
    ],
    steps: [
      "In Meta for Developers, create a Business app and add the Messenger product.",
      "Connect your Facebook Page and generate a Page access token (pages_messaging permission).",
      "Copy your Page ID, the token and the App secret here, and save.",
      "In Messenger › Settings › Webhooks, paste Keel's webhook address and verify token, and subscribe your Page to messages.",
    ],
  },
  instagram: {
    title: "Instagram",
    text: "Direct messages to your Instagram professional account are answered by the agent.",
    group: "Messaging apps",
    webhook: true,
    fields: [
      { key: "accountId", label: "Instagram account ID", help: "Meta app › Instagram › API setup, next to your account", placeholder: "17841400000000000" },
      { key: "accessToken", label: "Access token", help: "Meta app › Instagram › API setup › Generate token", secret: true },
      { key: "appSecret", label: "App secret", help: "Meta app › App settings › Basic (the Instagram app secret)", secret: true },
      {
        key: "api",
        label: "Connected through",
        help: "How your app reaches Instagram",
        choices: [
          { value: "instagram", label: "Instagram login (most new apps)" },
          { value: "facebook", label: "A Facebook Page linked to the account" },
        ],
      },
      { key: "pageId", label: "Facebook Page ID", help: "Only when connected through a Facebook Page", optional: true },
    ],
    steps: [
      "Use an Instagram professional account (business or creator).",
      "In Meta for Developers, add the Instagram product to a Business app, and add your account under API setup.",
      "Generate an access token with the instagram_business_manage_messages permission, and copy the account ID and token here.",
      "Copy the App secret, save, then paste Keel's webhook address and verify token in the Instagram webhooks settings and subscribe to messages.",
    ],
  },
  telegram: {
    title: "Telegram",
    text: "A Telegram bot for your business: anyone who messages it gets the agent's answers.",
    group: "Messaging apps",
    webhook: true,
    fields: [{ key: "botToken", label: "Bot token", help: "From @BotFather in Telegram, after /newbot", secret: true, placeholder: "123456:ABC-DEF…" }],
    steps: ["In Telegram, open @BotFather and send /newbot.", "Choose a name and a username for your bot.", "Copy the token BotFather gives you here and save: Keel connects the bot by itself."],
  },
  slack: {
    title: "Slack",
    text: "A message in your team's Slack channel whenever a customer needs a person, with a link to the conversation.",
    group: "Your support tools",
    webhook: false,
    fields: [{ key: "webhookUrl", label: "Incoming webhook address", help: "Slack › Apps › Incoming Webhooks › Add to a channel", secret: true, placeholder: "https://hooks.slack.com/services/…" }],
    steps: ["In Slack, add the Incoming Webhooks app (or create an app with incoming webhooks).", "Choose the channel your team watches, and copy the webhook address here."],
  },
  zendesk: {
    title: "Zendesk",
    text: "Every ticket the agent opens is created in your Zendesk too, with the whole conversation. A public reply you write there reaches the customer's chat, and what happens in the chat is added to the ticket as an internal note.",
    group: "Your support tools",
    webhook: true,
    fields: [
      { key: "subdomain", label: "Zendesk subdomain", help: "The first part of yourcompany.zendesk.com", placeholder: "yourcompany" },
      { key: "email", label: "Agent email", help: "The email of the Zendesk agent the API token belongs to" },
      { key: "apiToken", label: "API token", help: "Admin Center › Apps and integrations › Zendesk API › Add API token", secret: true },
    ],
    steps: [
      "In Zendesk Admin Center, open Apps and integrations › Zendesk API, turn on token access and add an API token.",
      "Enter your subdomain, the agent's email and the token here, and save.",
      "So your replies reach the customer's chat: in Apps and integrations › Webhooks, create a webhook to Keel's address below (POST, JSON), with Bearer token authentication and Keel's token below.",
      "Then in Objects and rules › Triggers, add a trigger: Ticket is Updated, Tags contains keel, Comment is Public. Action: notify the webhook with the body {\"ticket_id\": \"{{ticket.id}}\"}.",
    ],
  },
  freshdesk: {
    title: "Freshdesk",
    text: "Every ticket the agent opens is created in your Freshdesk too, with the whole conversation. A reply you send there reaches the customer's chat, and what happens in the chat is added to the ticket as a private note.",
    group: "Your support tools",
    webhook: true,
    fields: [
      { key: "domain", label: "Freshdesk domain", help: "The first part of yourcompany.freshdesk.com", placeholder: "yourcompany" },
      { key: "apiKey", label: "API key", help: "Freshdesk › your profile picture › Profile settings › Your API key", secret: true },
      { key: "fallbackEmail", label: "Email for customers without one", help: "Freshdesk needs a requester: used when the customer gave no email", placeholder: "support@yourcompany.com" },
    ],
    steps: [
      "In Freshdesk, open your profile settings and copy your API key.",
      "Enter your domain, the key, and an email to use when a customer didn't give theirs, and save.",
      "So your replies reach the customer's chat: in Admin › Automations › Ticket updates, add a rule for when a reply is sent on a ticket tagged keel. Action: trigger a webhook, POST to Keel's address below, with the header Authorization: Bearer and Keel's token below, and the content {\"ticket_id\": \"{{ticket.id}}\"}.",
    ],
  },
};

/** What each messaging app accepts in one message, so a long reply is sent in parts. */
export const MESSAGE_LIMIT: Record<MessagingKind, number> = { whatsapp: 4000, messenger: 1900, instagram: 950, telegram: 4000 };

/**
 * A reply as a messaging app shows it: citation marks dropped, Markdown made plain (WhatsApp keeps *bold*), and cut into
 * parts at paragraph or sentence breaks when it's longer than the app accepts.
 */
export function forMessaging(kind: MessagingKind, text: string): string[] {
  let plain = text
    .replace(/\s?\[\d{1,2}\]/g, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1");
  plain = kind === "whatsapp" ? plain.replace(/\*\*([^*]+)\*\*/g, "*$1*") : plain.replace(/\*\*([^*]+)\*\*/g, "$1");
  plain = plain.replace(/\n{3,}/g, "\n\n").trim();
  const limit = MESSAGE_LIMIT[kind];
  const parts: string[] = [];
  let rest = plain;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". ") + 1, window.lastIndexOf("\n"));
    const at = cut > limit * 0.5 ? cut : limit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
