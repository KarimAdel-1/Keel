# Architecture

Keel is one Next.js application running as a single Node.js process, with a Postgres database shared by every business and kept apart by row-level security. Every model call goes to NVIDIA Nemotron models on Nebius Token Factory through LangChain, and Keel's teams of agents (the customer turn, testing, quality, improvement and the Copilot) run as LangGraph graphs. NVIDIA NeMo Guardrails and NVIDIA garak run as separate programs on the same machine.

## The system

```mermaid
flowchart LR
  subgraph People
    B[Builder, in the dashboard]
    V[Visitor, in the chat on a website]
    Y[Your systems, through the REST API]
  end
  subgraph Keel["Keel: one Next.js process"]
    UI[Dashboard and website]
    CT[Customer turn graph]
    TT[Testing graph]
    QT[Quality graph]
    IT[Improvement graph]
    CP[Copilot graph]
    KN[Knowledge: website reader, documents, search]
    DB[(Postgres, row-level security)]
  end
  subgraph Nebius["Nebius Token Factory"]
    NM[NVIDIA Nemotron 3 Nano, 3.5 Lightning, 3 Super, 3 Ultra, 3.5 Super VL]
    EM[Embedding model]
  end
  subgraph Tools["NVIDIA tools, on the same machine"]
    GR[NeMo Guardrails server]
    GK[garak]
  end
  B --> UI
  V --> CT
  Y --> CT
  UI --> CT & TT & QT & IT & CP & KN
  CT --> GR
  GR --> NM
  CT & TT & QT & IT & CP --> NM
  KN --> EM
  GK -- attacks through a private endpoint --> CT
  CT & TT & QT & IT & CP & KN --> DB
```

- **One process.** Background work (reading a website, training knowledge, test runs, improvement sessions, quality checks, security scans) runs inside the server process. After a restart, interrupted test runs and improvement sessions start again once; a second interruption stops them, so a crash can't loop.
- **One database, many businesses, kept apart by Postgres.** Agents, knowledge (passages and their embeddings), conversations, tests and their runs, improvement sessions, versions, scans, usage and the agents' long-term memory all live in Postgres, migrated on start. Every table of a business's data has a `workspace_id` and row-level security; Keel connects with a login that owns none of the tables and can't bypass the policies. Each request sets its business once access is checked (`src/platform/session.ts`), and background work carries its business with it (`src/lib/tenant.ts`), so a forgotten check elsewhere can't reach another business's data: with no business set, a business's tables return nothing and Keel refuses the query. The owner login is used only for migrations and the lookups that come before a business is known (which business an agent or an API key belongs to).
- **Every model call is metered.** Each call is recorded with its task and tokens, so the Usage page shows what each of Keel's agents used ([agents.md](agents.md)).

## Every customer message: the customer turn

The same steps run for every message, wherever it comes from: the builder's test chat, the chat on a website, the REST API, or a test run.

```mermaid
flowchart TD
  M[Customer message] --> P[A photo, if sent: Nemotron 3.5 Super VL writes what it shows into the message]
  P --> L{Message limit and spam check}
  L -- paused as spam --> X[No reply]
  L --> G{NeMo Guardrails: input rail}
  G -- blocked --> N[The agent's cannot-help message]
  G -- allowed --> R1[recall: the conversation so far, and the procedure in progress]
  R1 --> R2[retrieve: keyword and meaning search, rankings fused; the meaning was started as the message arrived]
  R1 --> R3[route, at the same time: choose a procedure, and the actions that fit]
  R2 --> R4[respond: the model for the message; the customer agent answers from the passages]
  R3 --> R4
  R4 <--> T[think and act: call the agent's actions, read what they return]
  R4 --> R5[suggest: follow-up questions, when turned on]
  R5 --> R6[remember: store the reply, its sources, actions and tokens]
  R6 --> O{NeMo Guardrails: output rail, if turned on}
  O --> A[Reply with its sources]
```

The graph is in `src/platform/chat/answer.ts` (recall → retrieve and route together → respond → suggest → remember); the customer agent's own think-and-act loop is in `src/platform/chat/agent-graph.ts`; the checks around it are in `src/platform/chat/converse.ts`.

## A test run

An AI customer talks to the agent until it's done or the turns run out, then the conversation is judged.

```mermaid
flowchart LR
  C[customer: the AI customer writes the next message, or a test's exact first message] --> A[agent: the real customer turn; actions return the test's data]
  A -- more turns --> C
  A -- finished --> K[check_actions]
  K -- missing or unexpected actions --> F[Failed, no judge needed]
  K --> J1[first_judge: Nemotron 3 Super]
  J1 -- clear verdict, no wrong fact named --> V[Verdict]
  J1 -- unclear, or names a wrong fact --> J2[careful_judge: Nemotron 3 Ultra]
  J2 --> V
```

`src/platform/tests.ts`. Actions never run for real in a test or a security scan: each returns what the test says it returns.

## An improvement session

```mermaid
flowchart LR
  P[prepare: the tests] --> B[baseline: run them several times]
  B --> D[diagnose: why each failing test fails]
  D --> PR[propose: small, exact edits]
  PR --> E[evaluate: each edit on a copy of the agent]
  E --> C[confirm: the best edit on fresh runs]
  C -- another round --> D
  C --> FI[finish: the proven fix waits for the builder]
```

`src/platform/improve.ts`. Nothing changes on the live agent until the builder applies the fix; every applied change is saved as a version that can be restored.

## A quality check

```mermaid
flowchart LR
  W[write_questions: every kind customers ask] --> AS[ask: the agent answers, and the best answer is written]
  AS --> G[grade: Nemotron 3 Ultra grades both, blind]
  G --> T[check_tests: each test read twice against the information]
  T --> J[check_judges: passed conversations judged again with one planted mistake]
```

`src/platform/quality.ts`. A check only reads and asks; the agent doesn't change.

## The Copilot

The builder's own assistant follows LangGraph's supervisor pattern: the supervisor has one hand-off tool per specialist, and each hand-off becomes a LangGraph `Send`, so several specialists can work at once.

```mermaid
flowchart TD
  Q[Builder's request] --> S[supervisor: Nemotron 3 Super]
  S --> AN[analyst]
  S --> TE[tester]
  S --> IM[improver]
  S --> SE[security]
  S --> QU[quality]
  S --> RE[reader]
  AN & TE & IM & SE & QU & RE --> S
  S --> R[Answer, and any change proposed for the builder to approve]
```

`src/platform/copilot.ts`.

## A security scan, and fixing what got through

```mermaid
sequenceDiagram
  participant B as Builder
  participant K as Keel
  participant G as NVIDIA garak
  participant A as The agent
  participant S as Nemotron 3 Super
  B->>K: Start a security scan
  K->>G: Run the attacks, against a private endpoint with a one-scan token
  loop each attack
    G->>A: The attack, as a customer message
    A-->>G: The reply (NeMo Guardrails may block it first)
  end
  K->>S: Each attack garak flagged, with the reply
  S-->>K: The agent went along with it, or refused (cleared)
  B->>K: Fix what got through
  K->>K: Each attack becomes a security test that sends it word for word
  K->>K: Improve finds an edit that stops them without breaking passing tests
```

`src/platform/security.ts`, `src/lib/garak.ts`.

## Where things are

| Folder | What it holds |
| --- | --- |
| `src/app` | Pages and API routes (Next.js App Router): the website (`(site)`), the dashboard (`app/`), the hosted chat page (`chat/[id]`), the REST API (`api/v1`), the embed script (`embed.js`), the icons |
| `src/components` | The interface: dashboard, chat window and widgets, website |
| `src/platform` | Keel's agents and features: the customer turn (`chat/`), knowledge (`knowledge/`), tests, quality, improvement, security scans, the Copilot, memory, usage, versions, helpdesk, webhooks |
| `src/core` | Pure logic and definitions: agents, actions, widgets, procedures, industries, the garak attack list, reading HTML |
| `src/lib` | Infrastructure: the models and every model call (`models.ts`, `llm.ts`, `langchain.ts`, `gateway.ts`, `embeddings.ts`), NeMo Guardrails (`rails.ts`), garak (`garak.ts`), the database and migrations (`db.ts`), secrets, settings |
| `scripts/rails-server.py` | Starts NeMo Guardrails' server on this machine |

## Data

Postgres tables, created by numbered migrations in `src/lib/db.ts`. Accounts, sessions, workspaces and memberships are shared; every other table is one business's data, under row-level security:

- **Accounts:** users, workspaces, members, sessions, invites, API keys
- **Agents:** agents, agent versions, actions, procedures, widgets
- **Knowledge:** sources, chunks (passages with their embeddings), suggestions
- **Conversations:** conversations, messages, answer cache, contacts, submissions, tickets and their events
- **Testing and improving:** tests, test runs, improvements, quality checks, security scans
- **Keel's agents:** memories (the LangGraph Store), backstage (the Copilot's conversations), usage events
- **Integrations:** webhooks

## Security

- **Keys stay out of the code.** The Token Factory key is read from `.env.local`, which is never committed.
- **Secrets at rest are sealed.** API keys and header values inside actions, and webhook signing secrets, are encrypted with AES-256-GCM, each bound to its agent and field. The master key comes from `KEEL_SECRET_KEY`, or a key file created with owner-only permissions.
- **Each route checks who is asking.** Dashboard routes check the session and the workspace; the REST API takes a workspace API key (`Authorization: Bearer keel_sk_…`).
- **The chat protects itself.** Each agent has a per-visitor message limit, a spam check, a list of websites allowed to show it, and NVIDIA NeMo Guardrails.
- **Outgoing calls are checked.** Webhooks are signed. Website reading and actions refuse private network addresses unless `ALLOW_PRIVATE_NETWORK` is set.
- **The NVIDIA tools stay local.** NeMo Guardrails' server listens only on this machine, with NVIDIA's usage statistics off. garak reaches the agent only through a private endpoint that takes a one-scan token and a cap on calls.
- **Outside text is treated as data.** Customer messages, website text and documents are marked as untrusted in the prompts that include them, and the customer agent has a standing rule not to follow instructions hidden in pasted or encoded text.
