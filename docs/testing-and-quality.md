# Testing, quality and improvement

A business that puts an AI agent in front of customers can't easily know what it will say: a wrong refund policy or an invented price costs money and trust. Keel's answer is that every answer can be tested before customers see it, its quality can be measured, and every fix is proven before it's applied. This page explains how.

## AI customer tests

`src/platform/tests.ts`

**Writing tests.** The builder writes tests, or Keel's test writer (Nemotron 3 Super) writes a crowd of 4 to 20 from what the agent knows. Each test has:
- **The AI customer:** who they are, what they want and how they behave.
- **Their first message,** optionally, sent word for word.
- **What the agent must do** to pass.
- **The actions it must use,** if any, and what each one returns in the test.

The writer is told to check facts, not wording; never to forbid extra detail; and to ask only for what the customer asked.

**Running a test.**
1. The AI customer (Nemotron 3 Super) writes the customer's side of the conversation, one message at a time. It's written as one side of a script, not as a chat assistant, so it stays the customer.
2. The agent answers through its real customer turn: the same knowledge, actions, procedures and NeMo Guardrails as on a website. Actions never run for real: each returns what the test says it returns.
3. If the agent called the wrong actions, the run fails with no judge needed.

**Judging.** The judge reads the whole conversation next to the business's own information, focused on what was discussed. It works in this order:
1. **Wrong facts:** every price, time, policy, condition, link or contact detail the agent gave that the information contradicts or doesn't support. Any wrong fact fails the test.
2. **Test problems:** if the test expects something the information contradicts, or demands exact wording, the test is marked for the builder to check, and isn't counted against the agent.
3. **The verdict:** a score from 0 to 100 and up to three plain reasons.

Nemotron 3 Super judges first. Nemotron 3 Ultra judges again when Super's verdict isn't clear, or when Super says the agent got a fact wrong.

Answers vary, so a test can be run up to 10 times. Each run keeps its whole conversation, score and reasons.

## Quality check

`src/platform/quality.ts`

One button measures how good the agent's answers are:

- **Every kind of question:** simple questions, several at once, follow-ups, questions in other words, and questions the knowledge doesn't cover.
- **Graded blind:** Nemotron 3 Ultra grades each of the agent's answers out of 10 against the business's information, next to the best answer Keel can give (more of the knowledge, full thinking). When the best answer scores clearly higher, the report says the agent's settings cost some quality.
- **The tests are checked:** each test is read against the information twice, and marked only when both readings find a problem.
- **The judges are checked:** conversations that passed are judged again with one fact made wrong (a price, a number of days, a time of day). Each one should fail.

A check only reads and asks; the agent doesn't change.

## Improve

`src/platform/improve.ts`

The improvement agent fixes failing tests, with proof:

1. **Measure:** run the tests several times, because answers vary.
2. **Diagnose:** the Diagnostician (Nemotron 3 Ultra) finds why each failing test fails. The possible causes are: missing knowledge, knowledge the search didn't find, instructions, rules, an action not used or misused, a procedure, the model, or the test itself.
3. **Propose:** the Fixer (Nemotron 3 Ultra) writes small, exact edits. These can be a sentence in the instructions or rules, a clearer line on when to use an action, procedure steps, a Q&A copied word for word from the knowledge, or another model. Never new facts, prices or promises.
4. **Evaluate:** each edit is tried on a copy of the agent, never the live one. Failing tests come first, since an edit that fixes none of them isn't worth checking further; then the tests that already pass, to make sure nothing breaks.
5. **Confirm:** the best edit runs again on fresh runs. A failing test counts as fixed when it now passes at least 60% of the time, a third more often than before.
6. **The builder decides:** nothing changes until the builder applies the fix. Every applied change is a version that can be restored.

When a fact is missing from the knowledge, or a test is unfair, the improvement agent says what the builder needs to do instead of guessing. Its memory keeps every lesson, so it never retries a fix the builder turned down or one that already failed on the agent as it is.

**Where it starts:**
- the Improve page;
- **Fix the failing tests** on the Tests page;
- **Fix what got through** on a security scan: each attack that got through becomes a security test that sends the attacker's message word for word;
- asking the Copilot.

## What it costs

- **A test run:** about 26,000 tokens, mostly the judges reading the business's information.
- **A quality check of 10 questions:** about 3 minutes and 54,000 tokens.
- **Every call is metered:** the Usage page shows the tokens each agent and each of Keel's jobs used.

## How Keel itself is tested

- **67 automated tests.**
  - **50 call no model** (`npm run test:free`). They cover website reading against real local servers, documents, actions, webhooks, the data model, and test and security-test creation.
  - **17 run Keel's agents on the real models** (`npm test`). Each test file has a hard token cap and prints what it used.
- **Every change also passes** `npm run typecheck`, `npm run lint` and `npm run build`.
