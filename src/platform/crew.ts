// Keel's agents: every model-backed worker Keel runs, what it does, the model it runs on and the team it works in.
// The teams are LangGraph graphs, each with a fixed shape:
//
// - Customer turn (src/platform/chat/answer.ts): a pipeline run for every customer message. recall → retrieve →
//   route → respond → suggest → remember, with the customer agent's own think/act loop (agent-graph.ts) inside
//   "respond". NeMo Guardrails and the spam check stand around it (converse.ts).
// - Testing (src/platform/tests.ts): an AI customer and the agent talk in turns, then the judges decide.
// - Improvement (src/platform/improve.ts): measure → diagnose → propose → evaluate → confirm, round after round.
// - Quality (src/platform/quality.ts): questions → answers → grades → tests → judges, when the builder asks how good
//   the agent is.
// - Copilot (src/platform/copilot.ts): the builder's main agent. A supervisor reads the builder's request and hands
//   tasks to specialists (the analyst, the test runner, the improvement agent, the security scan, the conversation
//   reader), several at once when asked, the way LangGraph's supervisor does with handoff tools.
//
// The meter (src/platform/usage.ts) records each model call under a task name; `tasks` ties those to the agents
// here, so the Usage page can show what each agent used.

import { MODELS, ROLE_MODEL, VISION_MODEL, type ModelKey } from "@/lib/models";
import { EMBEDDING_MODEL } from "@/lib/embeddings";

export type Team = "Customer turn" | "Testing" | "Improvement" | "Quality" | "Copilot" | "Insights" | "Knowledge";

export interface CrewMember {
  id: string;
  name: string;
  team: Team;
  /** What it does, in a sentence. */
  does: string;
  /** The model it runs on, as people read it. */
  model: string;
  /** The meter's task names for its calls. */
  tasks: string[];
}

const name = (key: ModelKey) => MODELS[key].name;

export const CREW: CrewMember[] = [
  { id: "spam", name: "Spam checker", team: "Customer turn", does: "Reads a visitor's messages (after the 2nd, 4th, 8th and 16th) against the agent's definition of spam, and pauses spam.", model: name("lightning"), tasks: ["spam_check"] },
  { id: "guardrails", name: "NVIDIA NeMo Guardrails", team: "Customer turn", does: "Checks each customer message, and optionally each reply, against the agent's rails; blocks what breaks them.", model: name(ROLE_MODEL.quickCheck), tasks: ["guardrails input", "guardrails output"] },
  { id: "search", name: "Knowledge search", team: "Customer turn", does: "Finds the passages that answer a message, by meaning and by keywords.", model: EMBEDDING_MODEL.split("/").pop()!, tasks: ["embed"] },
  { id: "router", name: "Procedure router", team: "Customer turn", does: "Decides which step-by-step procedure applies, asked only when one could.", model: name("lightning"), tasks: ["procedure_choice"] },
  { id: "responder", name: "Customer agent", team: "Customer turn", does: "Answers the customer from the knowledge, citing it, and calls the agent's actions when they fit.", model: "The agent's model (Nemotron 3 Super unless you pick another)", tasks: ["reply", "agent step", "chat"] },
  { id: "followups", name: "Follow-up writer", team: "Customer turn", does: "Suggests the questions a customer may ask next, under answers from the knowledge.", model: name("lightning"), tasks: ["followup_questions"] },
  { id: "photo-reader", name: "Photo reader", team: "Customer turn", does: "Reads a photo a customer sends (a broken mug, a label, an error on a screen) and writes what it shows into their message for the agent.", model: VISION_MODEL.name, tasks: ["customer_photo"] },
  { id: "customer", name: "AI customer", team: "Testing", does: "Plays each test's customer, one message at a time.", model: name(ROLE_MODEL.testCustomer), tasks: ["test_customer_turn"] },
  { id: "judge", name: "Judges", team: "Testing", does: "Grade each test conversation: Super first, Ultra again when Super's verdict isn't clear.", model: `${name(ROLE_MODEL.firstJudge)}, then ${name(ROLE_MODEL.judge)}`, tasks: ["test_judgement"] },
  { id: "attack-checker", name: "Attack checker", team: "Testing", does: "Reads each attack NVIDIA garak flags in a security scan, with the agent's reply, and confirms whether the agent really went along with it.", model: name(ROLE_MODEL.firstJudge), tasks: ["attack_check"] },
  { id: "test-writer", name: "Test writer", team: "Testing", does: "Writes a crowd of AI customers from what the agent knows.", model: name(ROLE_MODEL.writer), tasks: ["generated_tests", "test_criteria"] },
  { id: "diagnostician", name: "Diagnostician", team: "Improvement", does: "Finds why each failing test fails: knowledge, search, instructions, rules, actions, procedures, the model or the test.", model: name(ROLE_MODEL.analyst), tasks: ["improvement_diagnosis"] },
  { id: "fixer", name: "Fixer", team: "Improvement", does: "Writes small, exact edits for those causes, each tried on a copy of the agent and kept only when proven.", model: name(ROLE_MODEL.analyst), tasks: ["improvement_candidates"] },
  { id: "question-writer", name: "Question writer", team: "Quality", does: "Writes the questions a quality check asks, of every kind customers ask, from the business's information.", model: name(ROLE_MODEL.writer), tasks: ["quality_questions"] },
  { id: "best-answer", name: "Best-answer writer", team: "Quality", does: "Writes the best answer Keel can give to each question (more of the knowledge, full thinking), to compare the agent's with.", model: name("super"), tasks: ["quality_best_answer"] },
  { id: "grader", name: "Grader", team: "Quality", does: "Grades the agent's answers and the best ones blind against the business's information, and checks every test against it.", model: name(ROLE_MODEL.judge), tasks: ["quality_grade", "test_audit"] },
  { id: "supervisor", name: "Copilot", team: "Copilot", does: "Reads the builder's request and hands it to the right specialists, several at once when asked.", model: name(ROLE_MODEL.writer), tasks: ["copilot"] },
  { id: "analyst", name: "Analyst", team: "Copilot", does: "Answers questions about how the agent is doing, from a report of it, and proposes changes to approve.", model: name(ROLE_MODEL.writer), tasks: ["backstage_answer"] },
  { id: "reader", name: "Conversation reader", team: "Insights", does: "Reads finished conversations for their topic and how the customer felt.", model: name("lightning"), tasks: ["conversation_reading"] },
  { id: "conflicts", name: "Conflict finder", team: "Insights", does: "Finds places where the agent's knowledge contradicts itself.", model: name(ROLE_MODEL.analyst), tasks: ["knowledge_conflict"] },
  { id: "drafter", name: "Helpdesk drafter", team: "Insights", does: "Drafts the team's next reply to a ticket.", model: name(ROLE_MODEL.writer), tasks: ["team_reply_draft"] },
  { id: "profile", name: "Profile writer", team: "Knowledge", does: "Drafts the business's profile and the agent's first instructions from its website.", model: name(ROLE_MODEL.writer), tasks: ["business_profile"] },
  { id: "scan-reader", name: "Picture reader", team: "Knowledge", does: "Copies the text from pictures and scanned PDFs a business adds to its knowledge (a price list, a menu, a scanned page), word for word.", model: VISION_MODEL.name, tasks: ["document_picture"] },
];

/** The agent a metered task belongs to. */
export function crewFor(task: string): CrewMember | undefined {
  // A retried or continued call belongs to the same agent.
  const plain = task.replace(/ \((retried longer|continued)\)$/, "");
  return CREW.find((m) => m.tasks.includes(plain));
}
