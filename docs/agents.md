# Keel's agents

Keel's work is done by 23 agents, each with one job, in teams. The customer turn, testing, quality, improvement and the Copilot each run as a LangGraph graph with a fixed shape (see [architecture.md](architecture.md) for the diagrams); the insights and knowledge agents are single calls. Every model call goes through LangChain to NVIDIA Nemotron on Nebius Token Factory. This list is the one Keel meters usage by (`src/platform/crew.ts`): the Usage page shows the tokens each agent used.

## Who decides which agent works

Each entry point has its own graph, so a message never passes through agents that have nothing to do with it:

- **A customer's message** runs the customer turn. Small routers inside it pick the procedure, the actions on offer and, when the agent is set to Automatic, the model.
- **A test run, an improvement session, a quality check or a security scan** runs its own graph.
- **The builder's requests** go to the Copilot, an LLM router (LangGraph's supervisor pattern), because only they are open-ended.

This follows LangGraph's own guidance: workflows where the path is known, agents where it isn't. Keel keeps control of the path itself, and each agent has one small job.

## The agents

### Customer turn

| Agent | What it does | Model |
| --- | --- | --- |
| Spam checker | Reads a visitor's messages (after the 2nd, 4th, 8th and 16th) against the agent's definition of spam, and pauses spam. | Nemotron 3.5 Lightning |
| NVIDIA NeMo Guardrails | Checks each customer message, and optionally each reply, against the agent's rails; blocks what breaks them. | Nemotron 3.5 Lightning |
| Knowledge search | Finds the passages that answer a message, by meaning and by keywords. | An embedding model on Nebius Token Factory |
| Procedure router | Decides which step-by-step procedure applies, asked only when one could. | Nemotron 3.5 Lightning |
| Customer agent | Answers the customer from the knowledge, citing it, and calls the agent's actions when they fit. | The agent's model (Nemotron 3 Super unless you pick another) |
| Follow-up writer | Suggests the questions a customer may ask next, under answers from the knowledge. | Nemotron 3.5 Lightning |
| Photo reader | Reads a photo a customer sends (a broken mug, a label, an error on a screen) and writes what it shows into their message for the agent. | Nemotron 3.5 Super VL |

### Testing

| Agent | What it does | Model |
| --- | --- | --- |
| AI customer | Plays each test's customer, one message at a time. | Nemotron 3 Super |
| Judges | Grade each test conversation: Super first, Ultra again when Super's verdict isn't clear. | Nemotron 3 Super, then Nemotron 3 Ultra |
| Attack checker | Reads each attack NVIDIA garak flags in a security scan, with the agent's reply, and confirms whether the agent really went along with it. | Nemotron 3 Super |
| Test writer | Writes a crowd of AI customers from what the agent knows. | Nemotron 3 Super |

### Improvement

| Agent | What it does | Model |
| --- | --- | --- |
| Diagnostician | Finds why each failing test fails: knowledge, search, instructions, rules, actions, procedures, the model or the test. | Nemotron 3 Ultra |
| Fixer | Writes small, exact edits for those causes, each tried on a copy of the agent and kept only when proven. | Nemotron 3 Ultra |

### Quality

| Agent | What it does | Model |
| --- | --- | --- |
| Question writer | Writes the questions a quality check asks, of every kind customers ask, from the business's information. | Nemotron 3 Super |
| Best-answer writer | Writes the best answer Keel can give to each question (more of the knowledge, full thinking), to compare the agent's with. | Nemotron 3 Super |
| Grader | Grades the agent's answers and the best ones blind against the business's information, and checks every test against it. | Nemotron 3 Ultra |

### Copilot

| Agent | What it does | Model |
| --- | --- | --- |
| Copilot | Reads the builder's request and hands it to the right specialists, several at once when asked. | Nemotron 3 Super |
| Analyst | Answers questions about how the agent is doing, from a report of it, and proposes changes to approve. | Nemotron 3 Super |

The Copilot's other specialists (the test runner, the improvement agent, the security scan, the quality check and the conversation reader) run the teams above and below.

### Insights

| Agent | What it does | Model |
| --- | --- | --- |
| Conversation reader | Reads finished conversations for their topic and how the customer felt. | Nemotron 3.5 Lightning |
| Conflict finder | Finds places where the agent's knowledge contradicts itself. | Nemotron 3 Ultra |
| Helpdesk drafter | Drafts the team's next reply to a ticket. | Nemotron 3 Super |

### Knowledge

| Agent | What it does | Model |
| --- | --- | --- |
| Profile writer | Drafts the business's profile and the agent's first instructions from its website. | Nemotron 3 Super |
| Picture reader | Copies the text from pictures and scanned PDFs a business adds to its knowledge (a price list, a menu, a scanned page), word for word. | Nemotron 3.5 Super VL |

## Why each model has the jobs it has

The track's own advice is to "reach for Nemotron 3 Ultra when you need serious reasoning, and let Nano or Super handle the fast, everyday calls". Keel follows it, and measured where each model holds up:

- **Nemotron 3.5 Lightning** does quick yes-or-no and routing work: guardrails, spam, picking a procedure, reading a conversation's topic.
- **Nemotron 3 Super** answers customers by default, plays the AI customers, judges first and writes drafts. Lightning was tried as the AI customer and slipped out of the role (asking the assistant what it wanted to buy), so the customer is Super.
- **Nemotron 3 Ultra** is used where being wrong is expensive: the careful judge, the grader, the Diagnostician and the Fixer, the conflict finder. Ultra only judges when Super isn't sure, or when Super says the agent got a fact wrong, so most conversations never need it.
- **Nemotron 3 Nano** is available as an agent's answering model for short, simple answers.
- **Nemotron 3.5 Super VL** reads pictures: what a customer's photo shows (a crack, a label, an error message), written into their message so the customer agent answers it with the business's policy, and the text in pictures and scanned PDFs added to the knowledge.

## Shared memory

Keel's agents share long-term memory, kept in a LangGraph Store in Keel's database, one namespace per customer agent:

| Memory | Written by | Read by |
| --- | --- | --- |
| Lessons: why each test failed, every fix tried and what happened, and what the builder applied, discarded or undid | the improvement agent; the builder's decisions | the Diagnostician and the Fixer (before every round), the Analyst |
| Notes: the builder's lasting preferences ("never change the tone") | the Copilot, when the builder states one | the Diagnostician, the Fixer, the Analyst |

- **One item per subject** (per test, per fix, per note subject), so newer knowledge replaces older instead of contradicting it, and each write is a single Postgres statement. Each business's memory is its own (row-level security).
- **Lessons hold for the agent as it was** when they were learned.
- **The judges read no memory,** so a verdict depends only on the conversation. **Customer agents read none,** because what they say changes only through settings the builder approves.
- **The improvement agent never tries again** a fix the builder turned down, or one that already failed on the agent as it is, and asks for different ideas when memory rules out every one.
- **Improve › Memory** shows everything, and can forget it.

Customer agents remember the conversation they're in (recent messages word for word, older ones shortened) and the procedure they're following.

## Reliability

- After three failed actions in a row, the customer agent stops retrying and can only bring in the team.
- Test runs and improvement sessions interrupted by a restart pick up again once; a second interruption stops them, so a crash can't loop.
- When a model's reply is cut off at its length limit, it's tried once more with more room; invalid JSON gets one repair against the full schema.
