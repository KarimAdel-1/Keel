// The website's feature pages: what each part of Keel does, in the words the product itself uses. Every claim here is
// something Keel does today; the lists of actions, widgets, layouts and styles come from the product's own definitions.

import { BadgeCheck, BookOpenText, ChartColumn, LifeBuoy, ListChecks, Radio, ShieldCheck, Sparkles, Target, TestTubes, Wand2, Zap, type LucideIcon } from "lucide-react";
import type { SiteVisual } from "./visuals";

export type Stage = "Build" | "Test" | "Launch" | "Improve";

/** The stages in the order a builder meets them, with a line on each. */
export const STAGES: { stage: Stage; text: string }[] = [
  { stage: "Build", text: "Teach it your business and what it can do." },
  { stage: "Test", text: "Check every answer before customers see it." },
  { stage: "Launch", text: "Put it on your site and work alongside it." },
  { stage: "Improve", text: "Fix what fails, with proof." },
];

export interface FeaturePage {
  slug: string;
  name: string;
  stage: Stage;
  icon: LucideIcon;
  /** One line, for menus and cards. */
  summary: string;
  title: string;
  intro: string;
  visual: SiteVisual;
  points: { title: string; text: string }[];
  /** A list drawn from the product's own definitions (kinds of action, layouts…). */
  lists?: ("actions" | "widgets" | "layouts" | "styles" | "attacks")[];
  steps?: { title: string; text: string }[];
  faq?: { q: string; a: string }[];
  related: string[];
}

export const FEATURES: FeaturePage[] = [
  {
    slug: "setup",
    name: "Guided setup",
    stage: "Build",
    icon: Target,
    summary: "Say what your agent should do. Keel sets it up, and tells you what's left.",
    title: "Say what it should do, not which settings to turn on",
    intro:
      "You don't need to know how AI agents work. Choose what your agent should do for your customers, in plain words, and Keel turns on what that needs, with good settings. Its Home page then lists what's left to do, most urgent first, with a one-click fix where there is one.",
    visual: "setup",
    points: [
      { title: "Goals in plain words", text: "Let customers reach a person, collect leads, take booking requests, handle returns and refunds, suggest what to ask next. Each one sets up the actions and step-by-step guides it needs." },
      { title: "Ready for your kind of business", text: "A shop starts with returns and a way to reach a person; a restaurant with booking requests. Change them any time." },
      { title: "A to-do list on Home", text: "What leaves customers stuck comes first, such as no way to reach a person. Many items fix themselves in one click." },
      { title: "Nothing is lost", text: "Turning a goal off switches off only what no other goal needs, and deletes nothing you wrote." },
      { title: "Plain names", text: "Home, Try it, Teach it, Check it, Put it live, Conversations and the Helpdesk inbox. Everything else waits under More tools." },
      { title: "Told when it matters", text: "When a customer needs a person, you hear about it in Keel, in your browser and by email." },
    ],
    steps: [
      { title: "Paste your website", text: "Keel reads it and drafts your agent." },
      { title: "Choose its goals", text: "What it should do for your customers." },
      { title: "Work down the to-do list", text: "Most urgent first, one click where it can be." },
      { title: "Put it live", text: "On your website, or in the messaging apps your customers use." },
    ],
    related: ["knowledge", "actions", "helpdesk"],
  },
  {
    slug: "knowledge",
    name: "Knowledge",
    stage: "Build",
    icon: BookOpenText,
    summary: "Your website and documents, read for you. Every answer shows its source.",
    title: "An agent that knows your business from what you already have",
    intro:
      "Paste your website and Keel reads it page by page. Add documents, notes, and questions with their answers. The agent answers only from this, shows where each answer came from, and says so when it doesn't know.",
    visual: "draft",
    points: [
      { title: "Reads your website", text: "Keel follows your sitemap and links, and reads help, shipping, returns, pricing and contact pages first. It skips carts, logins and the pages your robots.txt asks readers to skip." },
      { title: "You choose the pages", text: "Or let Keel find every page first, grouped by section, with its own picks ticked. It learns only the pages you keep." },
      { title: "Documents and notes", text: "Upload PDF, Word, text and Markdown files of up to 20 MB, type notes, or write a question with its answer. A photo of a price list or a scanned PDF is read too, by NVIDIA's vision model." },
      { title: "A first draft for you", text: "From your website, Keel drafts your business profile, the agent's role and greeting, and the questions customers ask most. It picks up your logo and colours too." },
      { title: "Keeps up with new documents", text: "Add a document later and Keel reads it, then proposes what to add to your profile and the agent's role. Nothing changes until you approve it." },
      { title: "Answers with sources", text: "Each answer marks the passages it used. One click opens the exact text, so you and your customers can check it." },
      { title: "No guessing", text: "When your information doesn't cover a question, the agent says so and offers your team. You can let it answer general questions too, said as not coming from your information." },
      { title: "Finds the gaps", text: "Answers to add lists the questions nothing answered (write the answer once and it becomes a Q&A) and the sources that say different things about the same subject." },
    ],
    steps: [
      { title: "Paste your website", text: "Watch Keel read it, or choose the pages yourself." },
      { title: "Check the draft", text: "The profile, role, greeting and top questions, ready to change." },
      { title: "Add what's missing", text: "Documents, notes and Q&As for what isn't on your site." },
      { title: "Try it", text: "Ask it anything and open its sources." },
    ],
    faq: [
      { q: "Which languages does it answer in?", a: "The customer's. The agent replies in the language the customer writes in, from your information." },
      { q: "Can I see and change what it learned?", a: "Yes. Every page and document is listed in What it knows, where you can read it, change it or remove it." },
      { q: "What if two of my pages disagree?", a: "Keel's conflict finder points out sources that say different things about the same subject, so you can fix the one that's wrong." },
    ],
    related: ["setup", "testing", "quality"],
  },
  {
    slug: "actions",
    name: "Actions and widgets",
    stage: "Build",
    icon: Zap,
    summary: "Let the agent do things in the chat: open tickets, collect details, call your systems.",
    title: "Answers are a start. Actions get things done.",
    intro:
      "Give the agent actions and it decides when to use each one, from a sentence you write about it. It can hand a customer over to your team, collect details, call your own system and show the result as chat cards: product cards, an order tracker or time slots.",
    visual: "actions",
    lists: ["actions", "widgets"],
    points: [
      { title: "You say when", text: "Each action has one sentence on when to use it. The agent reads it and decides, message by message." },
      { title: "Check before it's live", text: "A Call your API action can be tried with real values from the editor, so you see your system's response before the agent uses it." },
      { title: "Safe in tests", text: "In tests and security scans, actions return what you write for them and never run for real." },
      { title: "Tell your systems", text: "Webhooks send a signed message to your systems when a lead or details are collected, a ticket is opened, a chat is handed over or a test run finishes." },
    ],
    related: ["procedures", "helpdesk", "channels"],
  },
  {
    slug: "procedures",
    name: "Step-by-step guides",
    stage: "Build",
    icon: ListChecks,
    summary: "Your way of handling a request, step by step, for requests that need more than an answer.",
    title: "Teach the agent your way of handling a request",
    intro:
      "A step-by-step guide is for one kind of request, like a return or a change to a booking. You write when it applies and its steps, as plain numbered lines. The agent follows them, and calls your actions where a step says so. Goals come with guides already written.",
    visual: "procedure",
    points: [
      { title: "Plain steps", text: "Write steps the way you'd brief a new colleague. @name calls an action; lines starting with \"If …:\" and \"Otherwise:\" start branches." },
      { title: "Picked for each message", text: "A fast Nemotron model compares the customer's message with when each guide applies, and is asked only when one could." },
      { title: "Keeps its place", text: "The agent remembers which guide it's following and where it is, across the messages of a conversation." },
      { title: "Tested like the rest", text: "A test can require the actions a guide calls: the run fails when the agent skips one or calls another." },
    ],
    steps: [
      { title: "Say when it applies", text: "One sentence, such as: the customer wants to return something." },
      { title: "Write the steps", text: "Numbered lines, with branches and the actions to call." },
      { title: "Test it", text: "Run an AI customer through it and read the conversation." },
    ],
    related: ["actions", "testing", "improve"],
  },
  {
    slug: "testing",
    name: "AI customer tests",
    stage: "Test",
    icon: TestTubes,
    summary: "AI customers talk to your agent, and judges check every fact against your information.",
    title: "Test every answer before your customers see it",
    intro:
      "Keel writes a crowd of AI customers from what your agent knows, each with their own goal and mood. They chat with your agent the way real customers do. Then NVIDIA Nemotron judges each conversation and checks every fact the agent gave against your own information.",
    visual: "testRun",
    points: [
      { title: "A crowd in one click", text: "Generate 4 to 20 tests from your knowledge, or write your own: who the customer is, their first message if you like, and what the agent must do." },
      { title: "Two judges", text: "Nemotron 3 Super judges first. When its verdict isn't clear, or it says the agent got a fact wrong, Nemotron 3 Ultra judges again." },
      { title: "Facts, not wording", text: "The judge lists every price, time, policy or contact detail the agent gave that your information doesn't support. Any wrong fact fails the test." },
      { title: "Unfair tests flagged", text: "When a test expects something your information contradicts, the judge says so, and the test is marked for you to check instead of counting against the agent." },
      { title: "Actions checked too", text: "A test can require actions: the run fails when the agent doesn't use them, or uses others. What each action returns is up to you." },
      { title: "From failing to fixed", text: "Run tests once or up to 10 times each, since answers vary. Fix the failing tests sends them to Improve in one click." },
      { title: "Quick", text: "Six tests run at a time, so a crowd of eight is done in about a minute." },
    ],
    steps: [
      { title: "Generate a crowd", text: "AI customers written from what your agent knows." },
      { title: "Run them", text: "Each one chats with your agent until it's done." },
      { title: "Read the verdicts", text: "The whole conversation, the score and the judge's reasons." },
      { title: "Fix what fails", text: "One click starts Improve on the failing tests." },
    ],
    related: ["quality", "improve", "security"],
  },
  {
    slug: "quality",
    name: "Quality check",
    stage: "Test",
    icon: BadgeCheck,
    summary: "A blind grade of your agent's answers, and a check of the tests and judges themselves.",
    title: "Know how good your agent's answers really are",
    intro:
      "One button runs a full check. Keel asks your agent questions written from what it knows, and Nemotron 3 Ultra grades every answer blind against your information, next to the best answer Keel can give. It also checks that your tests match your information, and that the judges catch planted mistakes.",
    visual: "quality",
    points: [
      { title: "Every kind of question", text: "Simple questions, several at once, follow-ups, questions in other words, and questions your knowledge doesn't cover." },
      { title: "Graded blind", text: "Each answer is graded out of 10 against your information, next to the best answer Keel can give with more of your knowledge and full thinking." },
      { title: "What your settings cost", text: "When the best answer scores clearly higher, the report says so: a cheaper model or a narrower setting is costing some quality." },
      { title: "Tests checked", text: "Each test is read against your information twice, and marked only when both readings find a problem with it." },
      { title: "Judges checked", text: "Conversations that passed are judged again with one fact made wrong, such as a price or a number of days. Each one should fail." },
      { title: "Nothing changes", text: "A quality check only reads and asks. Your agent stays exactly as it is." },
    ],
    related: ["testing", "improve", "knowledge"],
  },
  {
    slug: "security",
    name: "Security",
    stage: "Test",
    icon: ShieldCheck,
    summary: "NVIDIA NeMo Guardrails on every message, and NVIDIA garak attacks before launch.",
    title: "Attack your agent before someone else does",
    intro:
      "NVIDIA NeMo Guardrails checks every customer message, and if you like every reply, against rules you write in plain words. NVIDIA garak attacks your agent the way attackers do, and Keel turns whatever gets through into tests and fixes.",
    visual: "scan",
    lists: ["attacks"],
    points: [
      { title: "Rules in plain words", text: "Describe the messages and replies to block in sentences. NeMo Guardrails checks them, and customers see your message instead." },
      { title: "Limits and spam", text: "A message limit stops one visitor flooding the agent. A spam check pauses conversations that match your definition of spam." },
      { title: "Your websites only", text: "Choose which websites can show the chat. Keel's own chat page always works." },
      { title: "Each business kept apart", text: "The database itself keeps every business's data apart, so no mistake in a page can show one business another's. The keys you connect, such as a WhatsApp token, are stored encrypted." },
      { title: "Real attacks", text: "A quick scan sends about 70 attacks of 14 kinds; a thorough one about 230. Actions never run for real during a scan." },
      { title: "Checked twice", text: "garak's detectors are quick string checks. Nemotron 3 Super reads each flagged reply, and clears the ones the agent actually refused." },
      { title: "Fix what got through", text: "Each attack that got through becomes a security test that sends it word for word. Improve looks for a rule that stops them, checked against your other tests." },
    ],
    related: ["improve", "testing", "actions"],
  },
  {
    slug: "channels",
    name: "Channels",
    stage: "Launch",
    icon: Radio,
    summary: "On your website with one line of code, or on WhatsApp, Messenger, Instagram and Telegram.",
    title: "Put your agent where your customers already are",
    intro:
      "Choose how the chat sits on your website, pick a style, your colour and your logo, and copy one line of code into your site. Every change shows in a live preview before you save. Customers who write on WhatsApp, Facebook Messenger, Instagram or Telegram reach the same agent.",
    visual: "layout",
    lists: ["layouts", "styles"],
    points: [
      { title: "Your brand", text: "Keel picks up your logo and colours from your website. Change them, the greeting and the suggested questions any time." },
      { title: "One line of code", text: "Paste it into your site once. Changes you save show up there without touching the code again." },
      { title: "Photos from customers", text: "A customer can send a photo, of a broken item, a label or an error on a screen. NVIDIA's vision model reads it, and the agent answers with your policy; your team sees what it showed." },
      { title: "The conversation follows them", text: "A customer who opens another page of your site, or comes back later, finds the conversation where they left it." },
      { title: "Messaging apps", text: "Connect WhatsApp, Messenger, Instagram or Telegram in a few steps. Keel checks your keys with the app before saving, and connects a Telegram bot by itself. There, the agent asks for a form's details in the conversation, and they're saved like a filled-in form." },
      { title: "A link to share", text: "The help page is a page of its own, at a link you can put in emails, posts or anywhere else." },
      { title: "Chat from your own app", text: "API keys let your own systems send messages to the agent and get its answers." },
      { title: "On or off", text: "Turn the agent off and visitors see a short message instead, while your team can still test it." },
    ],
    related: ["helpdesk", "actions", "analytics"],
  },
  {
    slug: "helpdesk",
    name: "Helpdesk and contacts",
    stage: "Launch",
    icon: LifeBuoy,
    summary: "Hand over to your team when it matters, and keep every lead and contact.",
    title: "When a customer needs a person, your team is one step away",
    intro:
      "The agent opens a ticket with a summary of the conversation, or hands the chat to someone from your team, who replies from the Helpdesk inbox. You're told at once, and the customer sees your reply where they wrote: in the chat, or in their messaging app. Leads and the details the agent collects land in Contacts.",
    visual: "inbox",
    points: [
      { title: "Tickets with a summary", text: "When a customer needs help the agent can't give, it opens a ticket with what happened so far, so nobody has to ask again." },
      { title: "Live handover", text: "Someone from your team takes over the chat from the Helpdesk inbox, and the agent steps back. A ticket becomes a live chat too: the chat keeps listening, and your first reply appears in it." },
      { title: "Told at once", text: "When a customer needs a person: an alert in Keel, a browser notification, and an email to everyone on your team who wants them." },
      { title: "Your helpdesk tools", text: "Each handover becomes a Zendesk or Freshdesk ticket with the conversation, and a reply your team writes there reaches the customer's chat. Alerts can go to a Slack channel too." },
      { title: "Drafted replies", text: "Keel drafts your team's next reply to a ticket. Change it or send it as it is." },
      { title: "Leads and contacts", text: "Everyone who leaves their details becomes a contact. Add people yourself, import a CSV, and add your own fields." },
      { title: "Collected details", text: "Order numbers, booking dates and form answers the agent collects are kept with the conversation." },
      { title: "Your team", text: "Invite your colleagues to the workspace, so the whole team works from the same inbox." },
    ],
    related: ["actions", "analytics", "channels"],
  },
  {
    slug: "analytics",
    name: "Analytics",
    stage: "Launch",
    icon: ChartColumn,
    summary: "What customers ask, how they feel, and where the agent falls short.",
    title: "See what your customers ask, and how they feel",
    intro:
      "Every conversation is kept with the agent's answers and the sources it used. Analytics shows chats over time, the topics customers bring up, and how they felt by the end.",
    visual: "analytics",
    points: [
      { title: "Every conversation", text: "Read any conversation with the sources behind each answer, and the actions the agent used." },
      { title: "Topics", text: "A fast Nemotron model reads finished conversations and groups them by what customers asked about." },
      { title: "Sentiment", text: "How each customer felt by the end of the conversation: positive, neutral or negative." },
      { title: "Weak spots to tests", text: "Improve can turn recent conversations that went badly (low confidence, handed over, unhappy) into tests." },
      { title: "Unanswered questions", text: "Questions your knowledge didn't answer appear in Answers to add, ready to be answered once." },
      { title: "Usage", text: "The tokens each agent and each of Keel's own jobs used, so nothing is hidden." },
    ],
    related: ["copilot", "improve", "knowledge"],
  },
  {
    slug: "improve",
    name: "Improve",
    stage: "Improve",
    icon: Wand2,
    summary: "Finds why tests fail, tries fixes on a copy, and keeps only what's proven.",
    title: "Make the agent better, with proof",
    intro:
      "The improvement agent runs your tests several times, finds why the failing ones fail, and tries small, exact fixes on a copy of your agent. A fix is kept only when it fixes failures without breaking tests that pass, and holds up on a fresh set of runs. Nothing changes until you apply it.",
    visual: "improve",
    points: [
      { title: "Finds the cause", text: "Missing knowledge, knowledge the search didn't find, instructions, rules, actions, step-by-step guides, the model, or the test itself." },
      { title: "Small, exact edits", text: "A sentence in the instructions or rules, a clearer line on when to use an action, the steps of a guide, a Q&A copied from your knowledge, or another model. Never new facts or promises." },
      { title: "Proof, not promises", text: "Before and after, measured on fresh runs of your tests. You see every edit and every test's result." },
      { title: "Says what it can't fix", text: "When a fact is missing from your information or a test is unfair, it tells you what to do instead of guessing." },
      { title: "Versions and undo", text: "Every change is saved as a version. Restore any earlier one in a click." },
      { title: "Learns from you", text: "It remembers what worked and what you turned down, and never tries a rejected fix again." },
    ],
    steps: [
      { title: "Measure", text: "Your tests, several runs each." },
      { title: "Diagnose", text: "Why each failing test fails." },
      { title: "Try fixes", text: "On copies of your agent, never the live one." },
      { title: "Confirm", text: "The best fix again, on fresh runs." },
      { title: "You apply", text: "Or discard. It's your call." },
    ],
    faq: [
      { q: "Where do I start it?", a: "From the Improve page, from Tests (Fix the failing tests), from a security scan (Fix what got through), or by asking the Copilot." },
      { q: "Can I check a change I made myself?", a: "Yes. Test this change runs your tests on the saved agent and on your change, side by side, and shows what it fixes and breaks." },
    ],
    related: ["testing", "security", "copilot"],
  },
  {
    slug: "copilot",
    name: "Copilot",
    stage: "Improve",
    icon: Sparkles,
    summary: "Ask about your agent, or ask it to run the tests, improve it or scan it.",
    title: "A copilot for the people who run the agent",
    intro:
      "Ask the Copilot anything about your agent: how it's doing, what customers ask, why a test failed. Or ask it to run the tests, check quality, improve the agent or scan it. It hands each request to the right specialist, and to several at once when you ask for more than one thing.",
    visual: "copilot",
    points: [
      { title: "Specialists behind it", text: "An analyst, a test runner, a quality checker, the improvement agent, the security scan and a conversation reader." },
      { title: "Answers from the facts", text: "It reads a report of your agent: the latest test results, quality check, scans and conversations." },
      { title: "Changes you approve", text: "When it proposes a change to the agent, you see it first and apply it yourself." },
      { title: "Plain answers", text: "Customer-facing problems first, and nothing it can't do proposed as if it could." },
    ],
    related: ["improve", "analytics", "testing"],
  },
];

export const featureBySlug = (slug: string) => FEATURES.find((f) => f.slug === slug);
