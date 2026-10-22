# How Keel uses NVIDIA and Nebius

Every answer, test, grade and fix in Keel comes from NVIDIA Nemotron models served by Nebius Token Factory. NVIDIA NeMo Guardrails checks the conversations, and NVIDIA garak attacks the agents. Nothing in Keel is simulated: there is no fake-model mode, and the tests that call models run on the real ones.

## Nebius Token Factory

- **Every model call goes to Token Factory**, through its OpenAI-compatible API (`https://api.tokenfactory.nebius.com/v1`, set by `NEBIUS_BASE_URL`), with the key in `NEBIUS_API_KEY`.
- **Through LangChain.** Nemotron on Token Factory is LangChain's OpenAI chat model pointed at Token Factory (`src/lib/langchain.ts`); every call Keel makes is in `src/lib/llm.ts`.
- **Embeddings too.** Knowledge search uses an embedding model on Token Factory (`src/lib/embeddings.ts`), fused with keyword search.
- **Through a gateway that keeps calls healthy** (`src/lib/gateway.ts`):
  - each model gets its own lane, with a cap on calls in flight that halves on a rate limit and recovers after a run of successes;
  - failed calls are retried with exponential backoff and jitter, honouring the server's `Retry-After`;
  - quota and billing errors, and requests that are simply wrong, are never retried.
- **Every call is metered** with its task and tokens. The Usage page shows the tokens used by each agent and by each of Keel's own jobs.

Keel doesn't use Nebius AI Cloud compute: it runs wherever Node.js runs and calls Token Factory.

## NVIDIA Nemotron models

| Model | Token Factory id | What Keel uses it for |
| --- | --- | --- |
| Nemotron 3 Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | An agent's answering model, when a builder picks it for short, simple answers |
| Nemotron 3.5 Lightning | `nvidia/Nemotron-3_5-Lightning` | Quick checks and routing: NeMo Guardrails' rails, spam, choosing a procedure, follow-up questions, reading conversations; simple questions when an agent is set to Automatic |
| Nemotron 3 Super | `nvidia/nemotron-3-super-120b-a12b` | Customer answers (the default), the AI customers, the first judge, drafts, the Copilot, confirming garak's findings |
| Nemotron 3 Ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` | Where being wrong is expensive: the careful judge, the quality grader, the Diagnostician and the Fixer, finding contradictions in knowledge |
| Nemotron 3.5 Super VL | `nvidia/Nemotron-3.5-Super-VL` | Pictures: what a customer's photo shows, and the text in pictures and scanned PDFs added to the knowledge (about 500 tokens a picture) |

The full list of Keel's 23 agents and their models is in [agents.md](agents.md).

**Ultra only when it's needed.** Super judges every test conversation first; Ultra judges again only when Super's verdict isn't clear, or when Super says the agent got a fact wrong. Most conversations never need Ultra.

**Automatic.** A builder can let Keel pick the model for each message: Lightning for a short question the knowledge clearly answers, Super when it takes more. That costs about half as much, and the setting says what it costs in quality: in a blind graded check, Lightning's answers scored 9.1 against Super's 9.6 out of 10.

### What the real models taught us (built into `src/lib/llm.ts`)

- **Lightning and Nano** get `reasoning_effort: "none"`, or they write their thinking into the reply.
- **Thinking counts against `max_tokens`.** A thinking model gets room for it on top of the answer's own limit, and a reply cut off at the limit is tried once more with more room.
- **Thinking models at temperature 0 can loop.** Nemotron 3 Ultra looped at temperature 0, so thinking models asked for temperature 0 use NVIDIA's recommended temperature 0.6 and top-p 0.95.
- **Where the format goes matters.** A structured answer's format goes in the system message, before the data, labelled as the answer's format: placed after the data, Ultra took the schema for the data. Invalid JSON gets one repair against the full schema.
- **Embedding latency varies widely** (1.5 to 56 seconds in our measurements). Keyword search answers alone when it clearly matches; otherwise the search waits for the meaning, because an answer worded differently from the question is found only by meaning.

## NVIDIA NeMo Guardrails

`src/lib/rails.ts`, `scripts/rails-server.py`

- **Each agent's guardrails are a NeMo Guardrails configuration** written from its settings: a self check of each customer message (input rail) and, if turned on, of each reply (output rail), with the agent's own rules in the prompts.
- **The rules are written in plain words** by the builder ("block a message that…", "block a reply that…"), with the message customers see instead.
- **Run by Nemotron 3.5 Lightning on Token Factory, through LangChain** (NeMo Guardrails' LangChain mode).
- **Keel starts NeMo Guardrails' server on demand**, listening only on this machine with usage statistics off, and checks messages through its `/v1/checks` API.
- **A change applies at once:** each version of an agent's rules gets its own configuration id (a hash of its content), and a repeated message is checked once.
- **If NeMo Guardrails isn't installed or doesn't answer,** chats go on and the Guardrails page says why.

## NVIDIA garak

`src/platform/security.ts`, `src/lib/garak.ts`, `src/core/garak-suite.ts`

- **What it sends:** a security scan runs garak against the agent with 14 kinds of attack in five groups: prompt injection, jailbreaks, encoded instructions, data leaks and code injection. A quick scan sends about 70 attacks, a thorough one about 230.
- **How it reaches the agent:** through a private endpoint on the same machine, with a one-scan token and a cap on calls. Each attack goes through the normal customer turn, so the agent's knowledge, actions and NeMo Guardrails are all part of what's tested. Actions never run for real during a scan.
- **Every finding is checked.** garak's detectors are quick string checks: a polite refusal worded the way they don't expect counts as an attack that got through. So Nemotron 3 Super reads every attack garak flags, with the agent's reply, and clears the ones the agent actually refused.
- **What got through gets fixed.** "Fix what got through" turns each attack that got through into a security test that sends it word for word. The improvement agent then looks for an edit that stops those attacks without breaking the tests that pass.

## Checking it yourself

`npm test` runs Keel's agents on the real models: replies, actions, AI customers and judges, an improvement session, the Copilot's routing, NeMo Guardrails and a small garak scan. Each test file has a hard token cap and prints the calls, tokens and cost it used.
