<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/keel-logo-dark.png">
  <img alt="Keel" src="docs/images/keel-logo.png" width="180">
</picture>

### Customer-service AI agents a business can trust

Built from its website, tested by a crowd of AI customers, and fixed with proof.<br>
Every model call runs on NVIDIA Nemotron, served by Nebius Token Factory.

[How it works](#how-it-works) · [Nemotron and Token Factory](#how-keel-uses-nvidia-nemotron-and-nebius-token-factory) · [Set up](#set-up) · [Architecture](docs/architecture.md) · [The 23 agents](docs/agents.md)

</div>

<br>

![Keel's Try it page: the demo shop's agent reads a customer's photo of a cracked mug with Nemotron 3.5 Super VL and answers with the shop's breakage policy](docs/images/try-it.png)

| | |
| --- | --- |
| **Track** | Best Apps and Agents |
| **Runs on** | Nebius Token Factory: every model call (answers, AI customers, judges, grading, fixes, embeddings) goes to its API |
| **NVIDIA open models** | Nemotron 3 Nano, Nemotron 3.5 Lightning, Nemotron 3 Super, Nemotron 3 Ultra, each with its own jobs, and Nemotron 3.5 Super VL for pictures |
| **NVIDIA tools** | NeMo Guardrails on every conversation; garak for security scans |
| **Agents** | 23 agents; the customer turn, testing, quality, improvement and the Copilot are LangGraph graphs, and every model call goes through LangChain |
| **Demo** | _link added at submission_ |
| **Video** | _link added at submission_ |
| **Licence** | [Apache 2.0](LICENSE) |

## Why Keel

A business that puts an AI agent in front of its customers can't easily know what the agent will say. One wrong refund policy or invented price costs money and trust, and the usual way to find out is a customer complaint. Building the agent is the easy part; knowing it's right, and keeping it right as the business changes, is the hard part.

Keel makes that part the product. The agent answers only from the business's own information and shows where each answer came from. Before launch, AI customers talk to it and Nemotron judges check every fact it gives against that information. After launch, the improvement agent fixes what fails, and keeps a fix only when fresh test runs prove it works and breaks nothing.

Keel is made for owners who aren't technical: plain words throughout, goals instead of settings, and a to-do list of what would leave customers stuck.

## How it works

```mermaid
flowchart LR
  W["Your website,<br/>documents and Q&As"] --> B["<b>1. Build</b><br/>answers only from<br/>your information"]
  B --> T["<b>2. Test</b><br/>AI customers talk to it;<br/>Nemotron judges every fact"]
  T --> Q["<b>3. Check quality</b><br/>answers graded blind<br/>against the best possible"]
  Q --> I["<b>4. Improve</b><br/>fixes kept only<br/>when proven"]
  I -- you approve --> L["<b>5. Launch</b><br/>your website, messaging<br/>apps, helpdesk, API"]
  L -- "real chats and the questions<br/>it couldn't answer" --> T
```

- **Build.** Paste a website address: Keel reads the site (including sites built with JavaScript), drafts the business's profile, the agent's role and greeting, the questions customers ask most, and picks up its logo and colours. Add documents, notes and Q&As (pictures and scanned PDFs are read too); add actions (tickets, live handover to the team, your own API, forms), widgets (cards, an order tracker, time slots, tables) and step-by-step procedures. Customers can send a photo (a broken item, a label, an error on a screen), and the agent answers it with the business's policy.
- **Test.** Keel writes a crowd of AI customers from what the agent knows. They talk to the agent through its real customer turn, and a Nemotron judge checks every price, time, policy and contact detail it gave against the business's information. Any wrong fact fails the test; a test that contradicts the information is flagged instead of counted against the agent.
- **Check quality.** One button asks the agent every kind of question customers ask, and Nemotron 3 Ultra grades each answer blind against the business's information, next to the best answer Keel can give. The check also verifies the tests themselves, and the judges with planted mistakes.
- **Guard and attack.** NVIDIA NeMo Guardrails checks every customer message, and optionally every reply, against rules the builder writes in plain words. NVIDIA garak attacks the agent with prompt injection, jailbreaks, encoded instructions, data leaks and code injection; Nemotron 3 Super confirms each finding.
- **Improve, with proof.** The improvement agent finds why tests fail, tries small, exact edits on a copy of the agent, and keeps only an edit proven on fresh runs that fixes failures without breaking tests that pass. One click starts it from failing tests ("Fix the failing tests") or from a security scan ("Fix what got through": each attack that got through becomes a security test). Nothing changes until the builder applies it, and every change is a version that can be restored.
- **Launch.** A chat bubble, side panel, focus window, embedded window or a page of its own, in four styles, with one line of code; WhatsApp, Facebook Messenger, Instagram and Telegram; plus a REST API and signed webhooks. A helpdesk inbox for handovers and tickets (the team's reply reaches the customer wherever they wrote from), alerts in Keel, in the browser and by email when a customer needs a person, handovers sent on to Zendesk or Freshdesk (the team's replies there reach the customer's chat) and Slack, contacts and leads, analytics of topics and sentiment.
- **Copilot.** The builder's own assistant: ask how the agent is doing, or ask it to run the tests, check quality, improve the agent or scan it. It hands each request to the right specialist, several at once.

<table>
  <tr>
    <td width="50%"><img src="docs/images/tests.png" alt="Tests: twelve AI-customer tests, each with its result and score, and a button to fix the failing ones"></td>
    <td width="50%"><img src="docs/images/quality.png" alt="Quality: answers 9.1 out of 10, tests 12 of 12 match the business's information, judges caught 5 of 5 planted mistakes"></td>
  </tr>
  <tr>
    <td><b>Tests.</b> AI customers written from what the agent knows; every fact judged. Failing tests go straight to Improve.</td>
    <td><b>Quality.</b> Answers graded blind next to the best Keel can give; the tests and the judges are checked too.</td>
  </tr>
  <tr>
    <td><img src="docs/images/home.png" alt="Home: a to-do list ordered by what would leave customers stuck, and goals to switch on in plain words"></td>
    <td><img src="docs/images/try-it.png" alt="Try it: the agent's settings beside a live chat, with the model and sources under each answer"></td>
  </tr>
  <tr>
    <td><b>Home.</b> What would leave customers stuck comes first; goals are switched on in plain words.</td>
    <td><b>Try it.</b> Each answer shows its sources, the procedure it followed and the Nemotron model that wrote it.</td>
  </tr>
</table>

### Improvement, with proof

```mermaid
flowchart LR
  F[Failing tests] --> D["<b>Diagnose</b><br/>Nemotron 3 Ultra finds<br/>why each one fails"]
  D --> P["<b>Propose</b><br/>small, exact edits"]
  P --> C["<b>Try</b><br/>each edit on a copy<br/>of the agent"]
  C --> R{"Fresh runs: fixes the<br/>failures and breaks<br/>nothing that passed?"}
  R -- yes --> K["Kept, for the<br/>builder to apply"]
  R -- no --> M["Remembered,<br/>never tried again"]
  M --> P
```

The causes it looks for are knowledge, search, instructions, rules, actions, procedures, the model and the test itself. What it learns stays in shared memory, so it never repeats a fix the builder turned down. More: [testing, quality and improvement](docs/testing-and-quality.md).

## How Keel uses NVIDIA Nemotron and Nebius Token Factory

Every model call in Keel goes to **Nebius Token Factory** through its OpenAI-compatible API, using LangChain. Each **NVIDIA Nemotron** model does the jobs it's best at, following the track's own advice ("reach for Nemotron 3 Ultra when you need serious reasoning, and let Nano or Super handle the fast, everyday calls"):

| Model | Jobs in Keel |
| --- | --- |
| **Nemotron 3.5 Lightning** | Quick checks and routing: NeMo Guardrails' rails, spam, choosing a procedure, follow-up questions, reading conversations, simple questions when an agent is set to Automatic |
| **Nemotron 3 Super** | Customer answers (the default), the AI customers, the first judge, drafting, the Copilot, confirming garak's findings |
| **Nemotron 3 Ultra** | Where being wrong is expensive: the careful judge (only when Super isn't sure, or says a fact is wrong), the quality grader, diagnosing failures and writing fixes, finding contradictions in knowledge |
| **Nemotron 3 Nano** | An agent's answering model, when the builder picks it for short, simple answers |
| **Nemotron 3.5 Super VL** | Pictures: what a customer's photo shows, and the text in pictures and scanned PDFs added to the knowledge |

One customer message, end to end:

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant K as Keel
  participant TF as Nebius Token Factory
  C->>K: "My mug arrived like this", with a photo
  K->>TF: Nemotron 3.5 Super VL: what does the photo show?
  K->>TF: Nemotron 3.5 Lightning: NeMo Guardrails input rail
  K->>TF: Embedding model: search the knowledge by meaning
  Note over K: Keyword search too, and the rankings fused
  K->>TF: Nemotron 3 Super: answer from the passages, calling actions when they fit
  K->>TF: Nemotron 3.5 Lightning: follow-up questions
  K-->>C: The reply, with its sources
```

**Where Token Factory accelerated our work.**
- **One API and one key for every model.** All four Nemotron sizes, the vision model and the embeddings sit behind the same OpenAI-compatible API, so LangChain worked against it unchanged. Moving a job to a bigger or smaller model is one line (`ROLE_MODEL` in `src/lib/models.ts`), which let us measure each job on each model instead of guessing.
- **No GPUs to run.** Keel's 23 agents, including a 550-billion-parameter Nemotron 3 Ultra, run with nothing to host but a Node.js app.
- **Parallel work.** Test runs, quality checks and security scans make many calls at once. A per-model gateway keeps them inside Token Factory's rate limits, adapting to its rate-limit headers and retrying with its `Retry-After` (`src/lib/gateway.ts`).

**NVIDIA NeMo Guardrails** runs for each agent in its LangChain mode, with Nemotron 3.5 Lightning on Token Factory checking the rails. **NVIDIA garak** attacks agents through a private endpoint, and its findings feed Keel's own fix loop.

Keel uses no other Nebius service: it doesn't run on Nebius AI Cloud compute. The details, with what the real models taught us (temperatures, thinking limits, structured output): [docs/nvidia-and-nebius.md](docs/nvidia-and-nebius.md).

## How it's built

```mermaid
flowchart LR
  B([Builder]) --> UI[Dashboard]
  V([Customers]) --> CH["Website chat, messaging<br/>apps, REST API"]
  CH --> CT[Customer turn]
  UI --> CT & TT[Tests] & QT[Quality] & IT[Improve] & CP[Copilot]
  CT --> GR[NVIDIA NeMo Guardrails]
  GK[NVIDIA garak] -- attacks --> CT
  GR & CT & TT & QT & IT & CP --> TF["Nebius Token Factory<br/>NVIDIA Nemotron"]
  CT & TT & QT & IT & CP --> DB[("Postgres<br/>row-level security")]
```

One Next.js application in one Node.js process, with Postgres. Many businesses share one database, and Postgres keeps them apart: every table of a business's data has row-level security, and Keel connects with a login that can't get around it (`src/lib/db.ts`, `src/lib/tenant.ts`). Each team of agents runs as a LangGraph graph with a fixed shape:

| Team | Graph |
| --- | --- |
| Customer turn, for every message | recall → retrieve → route → respond → suggest → remember, with the customer agent's own think-and-act loop inside "respond", and NeMo Guardrails before and after |
| Testing | customer ⇄ agent, then check actions → first judge (Super) → careful judge (Ultra, only when needed) |
| Improvement | prepare → baseline → diagnose → propose → evaluate → confirm, round after round |
| Quality | write questions → ask → grade → check the tests → check the judges |
| Copilot | supervisor → specialists, several at once (LangGraph's supervisor pattern) |

Keel's agents share long-term memory in a LangGraph Store: why tests failed, every fix tried, and what the builder applied or turned down, so the improvement agent never repeats a rejected fix.

More: [architecture and diagrams](docs/architecture.md) · [all 23 agents](docs/agents.md) · [testing, quality and improvement](docs/testing-and-quality.md) · [NVIDIA and Nebius](docs/nvidia-and-nebius.md)

### Project layout

```
src/app/         pages and API routes (Next.js): the website, the dashboard, the chat, the REST API
src/components/  the dashboard's and the chat's interface
src/platform/    the product: accounts, agents, knowledge, the customer turn, tests, quality, improvement, the Copilot
src/core/        pure logic with no database or model calls: agents' settings, search, procedures, widgets
src/lib/         the plumbing: Postgres, the model gateway, Token Factory, NeMo Guardrails, garak, email
scripts/         database setup, the demo business, accounts for a private server
docs/            architecture, the agents, testing and quality, NVIDIA and Nebius
```

## Spending less, never at the cost of quality

Keel saves tokens by not doing work that isn't needed, never by cutting what an answer needs. Cutting context to save tokens was tried and measured: it dropped answers worded differently from the question, so it was taken out.

- **Nothing that fits is cut.** Knowledge passages stay whole within the budget; the conversation stays word for word within about twenty exchanges; every enabled action is offered. A reply that reaches its length limit is carried on, not cut.
- **Work that isn't needed isn't done.** The same opening question to an unchanged agent is answered from memory; the procedure router runs only when a procedure could apply; NeMo Guardrails checks a repeated message once.
- **Keel's own agents stop when the answer is known.** A test run that called the wrong actions fails with no judge; Ultra judges only when Super isn't sure; the improvement agent stops a test's runs once its result is decided, reuses the last day's results for an unchanged agent, and never retries a fix its memory rules out.
- **Every agent's Quality page measures the cost of a setting:** the agent's answers against the best answer Keel can give, graded blind, so a setting that costs quality shows up as a gap.

## Requirements

- Node.js 24 or later.
- Postgres 15 or later (on a Mac: `brew install postgresql@17`; on Windows: the installer from postgresql.org).
- [uv](https://docs.astral.sh/uv/) for the NVIDIA tools (it installs its own Python).
- A Nebius Token Factory API key.

## Set up

```sh
git clone https://github.com/KarimAdel-1/Keel.git
cd Keel
npm install
cp .env.example .env.local          # then add NEBIUS_API_KEY
npm run db:setup -- --write         # the database and its two logins, into .env.local
                                    # (Windows: npm run db:setup -- postgres://postgres:PASSWORD@localhost:5432/postgres --write)

# NVIDIA NeMo Guardrails (with LangChain) and NVIDIA garak
uv tool install 'nemoguardrails[server]' --python 3.12 --with langchain --with langchain-openai --with langchain-core --with langchain-community
uv tool install garak

# A headless browser, to read websites built with JavaScript
npx playwright-core install --only-shell chromium
```

Keel works without the NVIDIA tools and the browser: their pages say what's missing, and chats go on.

## Run

```sh
npm run dev        # Nemotron on Token Factory, with your key
```

Open http://localhost:3000, create an account, and create an agent from your website. Every answer, test and improvement calls the real models; Usage shows what they used.

To see everything working on a made-up shop first, build the demo business in your account (about 10 minutes and 15 cents): its knowledge, goals, an order lookup with its own sample order system, tests run once, ten sample chats (marked Sample, one with a photo) and a quality check.

```sh
npm run demo -- you@yourcompany.com
```

## Check

```sh
npm run typecheck
npm run lint
npm test           # everything, on the real models (each test file has a hard token cap and prints what it used)
npm run test:free  # only the tests that call no model: free, for quick checks
npm run build
```

The live tests run Keel's agents for real: replies, actions, AI customers and judges, an improvement session, the Copilot's routing, NeMo Guardrails, and a small garak scan. Without a key they're skipped with the reason; nothing is faked. Website reading, API actions and webhooks are tested against real servers on this machine.

## Go live

To show the chat on a real website, Keel has to run on a public HTTPS address:

- Set `KEEL_PUBLIC_URL` to that address: embed codes and links use it.
- Set `KEEL_SECRET_KEY` (`openssl rand -base64 32`) and keep a copy apart from the data: it encrypts the API keys inside actions and webhook secrets.
- Put a reverse proxy with HTTPS in front and set `TRUST_PROXY=1`, so per-visitor limits see real addresses.
- Back up Postgres (`pg_dump`) and keep `KEEL_DATA_DIR` on a persistent disk: it holds the guardrails configurations.
- Run one server process (`npm run build && npm start`): background work (training, tests, improvements, scans) runs in it, and is picked up or marked stopped after a restart.
- `KEEL_SIGNUPS=0` closes open sign-ups; people then join by invitation link (Workspace settings › Team).
- `KEEL_PRIVATE=1` makes a private server, such as one for judges: no sign-ups or invitations, and agents' chats answer only people signed in to their workspace. Make its accounts with `npm run create-account -- someone@company.com "Their name"`, or a login in each judge's own name, each with its own demo, with `npm run judge-accounts -- yourdomain.com --names judges.txt` (one name per line; both print the password once). `KEEL_ACCOUNT_LIMIT_USD=1` gives each account that much of AI work in all, so accounts sharing one Token Factory balance can't use it up: after it, new tests, quality checks, improvements and scans don't start, and the chat still answers.

NeMo Guardrails' server is started by Keel on demand and listens only on this machine, with NVIDIA's usage statistics off. garak reaches the agent only through a private endpoint on this machine with a one-scan token.

## Limitations we measured

Measured on the made-up demo business (`npm run demo`) on the real models, 21 and 22 Oct 2026. We publish them because they're where Keel is honest about itself, and where it goes next.

- **Scores move from run to run.** Each quality check writes new questions and each build writes new tests. Five builds gave answers from 8.9 to 10.0 out of 10 (the best answer Keel can give: 9.6 to 10.0) and 8 to 11 passed tests out of 11 or 12. Treat one check as a sample: run it twice before deciding.
- **The model still slips on details.** Seen in those runs: a fact the customer would want left out (a 35% wholesale discount), a condition made less exact (next-day delivery for a Friday order), a promise the business never made ("we'll let you know when we ship to the US"), an invented detail ("hand-dyed linen"), and once an invented web address. The judges catch most of these; web addresses, emails and phone numbers are checked word for word against the business's information; Improve fixes what keeps coming back.
- **Tests Keel writes can be unfair.** A test sometimes asks for a fact its customer never asked about, or expects "I don't know" for something the information answers. The test writer now cuts each test to what its customer asks, and the judges and the quality check flag unfair tests, but two got through in one run on 21 Oct.
- **The judges are models too.** One missed an invented web address (now caught by a plain check, not a model). garak's string checks count a polite refusal as an attack that got through; Nemotron 3 Super confirms each one.
- **Messaging apps and helpdesks** (WhatsApp, Messenger, Instagram, Telegram, Zendesk, Freshdesk, Slack) are tested against local stand-ins of their APIs. Before a business can message the public on WhatsApp, Messenger or Instagram, Meta reviews its app.
- **Windows:** Keel is developed and tested on macOS. On Windows, NeMo Guardrails and garak (Python tools, installed with uv) are the least tested part; without them Keel still answers, and their pages say what's missing.
- **One server process** runs the background work (tests, improvements, scans); a restart picks it up again or marks it stopped.
- **Not included:** payments and plans (model use is metered in tokens and kept low by Keel itself); voice (customers write or send a photo); websites that turn away automated readers (upload the pages' text instead).

## Accessibility

- The chat announces new messages to screen readers as they arrive, and its controls (send, stop, photo, close) have labels.
- The website's moving pictures stand still for visitors who ask their device for less motion.
- The chat comes in light and dark themes, and the agent answers in the language each customer writes in.
- Plain words throughout the dashboard, for owners who aren't technical: goals instead of settings, and a to-do list instead of a checklist of features.
- Next: a keyboard-only pass over the dashboard, and a contrast check of the four chat styles in both themes.

## Licence

Keel is open source under the [Apache License 2.0](LICENSE). Copyright and attribution: [NOTICE](NOTICE).

Made by Karim Bonda ([@KarimAdel-1](https://github.com/KarimAdel-1)) for the Nebius × NVIDIA hackathon.
